"""Export routes: generate Excel and PDF reports."""

import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from db.database import get_db, Client, User
from services.exporter import export_excel, export_pdf
from services.auth import get_current_user

router = APIRouter(prefix="/api/export", tags=["export"])


def _build_export_data(client: "Client") -> dict:
    """Build the export data dict from a client's DB records."""
    data = {
        "client": {
            "name": client.name,
            "created_at": client.created_at.strftime("%Y-%m-%d") if client.created_at else "",
        },
        "credit": {},
        "bank": {},
    }

    # Merge credit report data (use the latest one if multiple)
    if client.credit_reports:
        latest_credit = sorted(client.credit_reports, key=lambda r: r.created_at or "", reverse=True)[0]
        if latest_credit.parsed_data and isinstance(latest_credit.parsed_data, dict):
            data["credit"] = latest_credit.parsed_data

    # Merge bank statement analysis (use the latest one if multiple)
    if client.bank_statements:
        latest_bank = sorted(client.bank_statements, key=lambda s: s.created_at or "", reverse=True)[0]
        if latest_bank.analysis and isinstance(latest_bank.analysis, dict):
            data["bank"] = latest_bank.analysis

    return data


@router.get("/{client_id}/excel")
def export_excel_report(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    data = _build_export_data(client)
    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    tmp.close()

    try:
        export_excel(data, tmp.name)
        return FileResponse(
            path=tmp.name,
            filename=f"{client.name}_分析报告.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail=f"Failed to generate Excel report: {str(e)}")


@router.get("/{client_id}/pdf")
def export_pdf_report(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    data = _build_export_data(client)
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()

    try:
        export_pdf(data, tmp.name)
        return FileResponse(
            path=tmp.name,
            filename=f"{client.name}_分析报告.pdf",
            media_type="application/pdf",
        )
    except Exception as e:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF report: {str(e)}")
