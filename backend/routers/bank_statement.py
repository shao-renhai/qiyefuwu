"""Bank statement upload and analysis routes."""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from db.database import get_db, Client, BankStatement
from models.schemas import BankStatementResponse

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
):
    # Verify client exists
    client = db.query(Client).filter(Client.id == client_id).first()
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
