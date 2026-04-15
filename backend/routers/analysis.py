"""Analysis routes: combined client analysis view."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db, Client, CreditReport, BankStatement, User
from models.schemas import FullAnalysisResponse
from services.auth import get_current_user

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/{client_id}", response_model=FullAnalysisResponse)
def get_analysis(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # 按时间倒序返回，确保最新数据在前
    credit_reports = db.query(CreditReport).filter(
        CreditReport.client_id == client_id
    ).order_by(CreditReport.created_at.desc()).all()

    bank_statements = db.query(BankStatement).filter(
        BankStatement.client_id == client_id
    ).order_by(BankStatement.created_at.desc()).all()

    return {
        "client": client,
        "credit_reports": credit_reports,
        "bank_statements": bank_statements,
    }
