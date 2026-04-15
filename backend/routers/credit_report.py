"""Credit report upload, manual data entry, and analysis routes."""

import logging
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db.database import get_db, Client, CreditReport, User
from models.schemas import CreditReportResponse
from services.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/credit-report", tags=["credit-report"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "credit")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _empty_credit_data() -> dict:
    """Return an empty but schema-valid credit data dict."""
    return {
        "total_debt": 0.0,
        "total_balance": 0.0,
        "institution_details": [],
        "credit_card_total_limit": 0.0,
        "credit_card_used": 0.0,
        "credit_card_usage_rate": 0.0,
        "active_loans": [],
        "overdue_records": [],
        "query_records": {
            "recent_1m": {"loan_approval": 0, "corporate_review": 0},
            "recent_3m": {"loan_approval": 0, "corporate_review": 0},
            "recent_6m": {"loan_approval": 0, "corporate_review": 0},
            "recent_1y": {"loan_approval": 0, "corporate_review": 0},
        },
    }


@router.post("/upload", response_model=CreditReportResponse)
async def upload_credit_report(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify client exists and belongs to current user
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Detect file type by extension
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    image_exts = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp"}

    if ext == ".pdf":
        file_type = "pdf"
    elif ext in image_exts:
        file_type = "image"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Save file
    saved_filename = f"{uuid.uuid4().hex}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_filename)
    content = await file.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    # Parse the credit report
    parsed_data = None
    parse_error = None
    try:
        if file_type == "pdf":
            # Try pdfplumber first
            try:
                from services.credit_parser import parse_credit_report_pdf
                parsed_data = parse_credit_report_pdf(saved_path)
            except (ValueError, Exception) as e:
                logger.info("pdfplumber failed (%s), falling back to OCR", e)
                # Fallback to OCR for scanned PDFs
                from services.credit_ocr import parse_credit_report_scanned_pdf
                parsed_data = parse_credit_report_scanned_pdf(saved_path)
        else:
            # Image file - use OCR directly
            from services.credit_ocr import parse_credit_report_image
            parsed_data = parse_credit_report_image(saved_path)
    except Exception as e:
        logger.error("Credit report parsing failed: %s", e, exc_info=True)
        parse_error = str(e)
        parsed_data = _empty_credit_data()

    # 同一客户只保留最新征信报告，删除旧记录
    old_reports = db.query(CreditReport).filter(
        CreditReport.client_id == client_id
    ).all()
    for old in old_reports:
        # 尝试删除旧文件
        old_path = os.path.join(UPLOAD_DIR, old.filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
        db.delete(old)

    # Create DB record
    report = CreditReport(
        client_id=client_id,
        filename=saved_filename,
        file_type=file_type,
        parsed_data=parsed_data,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    if parse_error:
        logger.warning("Credit report saved but parsing had errors: %s", parse_error)

    return report


# ─── 手动数据录入 ──────────────────────────────────────────────────────

class ManualDataPayload(BaseModel):
    mode: str = "quick"  # 'quick' | 'detail'
    data: dict


@router.put("/{report_id}/manual")
def save_manual_data(
    report_id: int,
    payload: ManualDataPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(CreditReport).filter(CreditReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    client = db.query(Client).filter(Client.id == report.client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=403, detail="Permission denied")

    report.manual_data = payload.data
    report.manual_mode = payload.mode
    db.commit()
    return {"status": "ok", "mode": payload.mode}


@router.get("/{report_id}/manual")
def get_manual_data(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(CreditReport).filter(CreditReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    client = db.query(Client).filter(Client.id == report.client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {
        "report_id": report.id,
        "mode": report.manual_mode,
        "manual_data": report.manual_data,
        "parsed_data": report.parsed_data,
    }


# ─── 征信分析报告（融合 manual + parsed 生成） ─────────────────────────

@router.get("/{report_id}/analysis-report")
def generate_analysis_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(CreditReport).filter(CreditReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    client = db.query(Client).filter(Client.id == report.client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=403, detail="Permission denied")

    from services.credit_analysis import build_analysis_report
    return build_analysis_report(report.manual_data, report.parsed_data, client.name)


# ─── 按客户获取最新征信报告 ────────────────────────────────────────────

@router.get("/client/{client_id}")
def get_latest_report(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    report = db.query(CreditReport).filter(
        CreditReport.client_id == client_id
    ).order_by(CreditReport.created_at.desc()).first()

    if not report:
        return {"report": None}

    return {
        "report": {
            "id": report.id,
            "client_id": report.client_id,
            "filename": report.filename,
            "file_type": report.file_type,
            "parsed_data": report.parsed_data,
            "manual_data": report.manual_data,
            "manual_mode": report.manual_mode,
            "created_at": report.created_at.isoformat() if report.created_at else None,
        }
    }
