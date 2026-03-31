"""Credit report upload and parsing routes."""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from db.database import get_db, Client, CreditReport
from models.schemas import CreditReportResponse

router = APIRouter(prefix="/api/credit-report", tags=["credit-report"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "credit")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=CreditReportResponse)
async def upload_credit_report(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    db: Session = Depends(get_db),
):
    # Verify client exists
    client = db.query(Client).filter(Client.id == client_id).first()
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
    try:
        if file_type == "pdf":
            # Try pdfplumber first
            try:
                from services.credit_parser import parse_credit_report_pdf
                parsed_data = parse_credit_report_pdf(saved_path)
            except (ValueError, Exception):
                # Fallback to OCR for scanned PDFs
                from services.credit_ocr import parse_credit_report_scanned_pdf
                parsed_data = parse_credit_report_scanned_pdf(saved_path)
        else:
            # Image file - use OCR directly
            from services.credit_ocr import parse_credit_report_image
            parsed_data = parse_credit_report_image(saved_path)
    except Exception as e:
        # Store record even if parsing fails
        parsed_data = {"error": str(e)}

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
    return report
