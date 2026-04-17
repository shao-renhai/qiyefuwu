"""Bank statement upload and analysis routes."""

import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.database import (
    get_db, Client, BankStatement, User, BankAnalysisContext,
)
from models.schemas import BankStatementResponse
from services.auth import get_current_user

router = APIRouter(prefix="/api/bank-statement", tags=["bank-statement"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "bank")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=BankStatementResponse)
async def upload_bank_statement(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    account_holder: str = Form(...),
    bank_name: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify client exists and belongs to current user
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Validate file type
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".xlsx", ".xls", ".csv", ".pdf"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Only xlsx, xls, csv, pdf accepted.")

    # Save file
    saved_filename = f"{uuid.uuid4().hex}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_filename)
    content = await file.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    # Parse and analyze
    from services.bank_parser import parse_bank_statement
    from services.analyzer import analyze_bank_statement

    try:
        transactions = parse_bank_statement(saved_path)
        analysis = analyze_bank_statement(transactions, account_holder)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse bank statement: {str(e)}")

    # Convert transactions to serializable format
    raw_data = [dict(tx) for tx in transactions]

    # 同一客户 + 同一银行只保留最新流水，删除旧记录
    old_query = db.query(BankStatement).filter(
        BankStatement.client_id == client_id
    )
    if bank_name:
        # 有银行名：只替换同银行的旧记录
        old_query = old_query.filter(BankStatement.bank_name == bank_name)
    else:
        # 无银行名：替换所有无银行名的旧记录
        old_query = old_query.filter(
            (BankStatement.bank_name == None) | (BankStatement.bank_name == "")  # noqa: E711
        )
    for old in old_query.all():
        old_path = os.path.join(UPLOAD_DIR, old.filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
        db.delete(old)

    # Create DB record
    statement = BankStatement(
        client_id=client_id,
        filename=saved_filename,
        bank_name=bank_name,
        raw_data=raw_data,
        analysis=analysis,
    )
    db.add(statement)
    db.commit()
    db.refresh(statement)
    return statement


# ─── 列表 / 删除（客户级管理） ─────────────────────────────────────────

@router.get("/client/{client_id}/statements")
def list_client_statements(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(
        Client.id == client_id, Client.user_id == current_user.id
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    rows = (
        db.query(BankStatement)
        .filter(BankStatement.client_id == client_id)
        .order_by(BankStatement.created_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "filename": s.filename,
            "bank_name": s.bank_name,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "tx_count": len(s.raw_data) if isinstance(s.raw_data, list) else 0,
        }
        for s in rows
    ]


@router.delete("/statement/{statement_id}")
def delete_statement(
    statement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    st = db.query(BankStatement).filter(BankStatement.id == statement_id).first()
    if not st:
        raise HTTPException(status_code=404, detail="Statement not found")
    client = db.query(Client).filter(
        Client.id == st.client_id, Client.user_id == current_user.id
    ).first()
    if not client:
        raise HTTPException(status_code=403, detail="Permission denied")

    saved_path = os.path.join(UPLOAD_DIR, st.filename)
    if os.path.exists(saved_path):
        try:
            os.remove(saved_path)
        except OSError:
            pass
    db.delete(st)
    db.commit()
    return {"status": "ok"}


# ─── 客户级补录数据（阶段 A 必填） ─────────────────────────────────────

class BankContextPayload(BaseModel):
    target_loan_amount: Optional[float] = None
    existing_monthly_payment: Optional[float] = None
    industry: Optional[str] = None


def _ensure_client_owner(db: Session, client_id: int, current_user: User) -> Client:
    client = db.query(Client).filter(
        Client.id == client_id, Client.user_id == current_user.id
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.get("/client/{client_id}/context")
def get_bank_context(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_client_owner(db, client_id, current_user)
    ctx = db.query(BankAnalysisContext).filter(
        BankAnalysisContext.client_id == client_id
    ).first()

    # 从最新征信自动预填"现有月还款"（若用户尚未手动设置）
    from services.bank_diagnosis import prefill_monthly_payment_from_credit
    suggested_monthly = prefill_monthly_payment_from_credit(db, client_id)

    return {
        "target_loan_amount": ctx.target_loan_amount if ctx else None,
        "existing_monthly_payment": ctx.existing_monthly_payment if ctx else None,
        "industry": ctx.industry if ctx else None,
        "suggested_monthly_payment": suggested_monthly,
        "exists": ctx is not None,
    }


@router.put("/client/{client_id}/context")
def upsert_bank_context(
    client_id: int,
    payload: BankContextPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_client_owner(db, client_id, current_user)
    ctx = db.query(BankAnalysisContext).filter(
        BankAnalysisContext.client_id == client_id
    ).first()
    if ctx is None:
        ctx = BankAnalysisContext(client_id=client_id)
        db.add(ctx)
    ctx.target_loan_amount = payload.target_loan_amount
    ctx.existing_monthly_payment = payload.existing_monthly_payment
    if payload.industry is not None:
        ctx.industry = payload.industry
    db.commit()
    db.refresh(ctx)
    return {
        "status": "ok",
        "target_loan_amount": ctx.target_loan_amount,
        "existing_monthly_payment": ctx.existing_monthly_payment,
        "industry": ctx.industry,
    }


# ─── 合并诊断报告 ─────────────────────────────────────────────────────

@router.get("/client/{client_id}/diagnosis-report")
def diagnosis_report(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = _ensure_client_owner(db, client_id, current_user)
    statements = (
        db.query(BankStatement)
        .filter(BankStatement.client_id == client_id)
        .order_by(BankStatement.created_at.asc())
        .all()
    )
    ctx = db.query(BankAnalysisContext).filter(
        BankAnalysisContext.client_id == client_id
    ).first()

    from services.bank_diagnosis import build_bank_diagnosis_report
    return build_bank_diagnosis_report(client, statements, ctx)
