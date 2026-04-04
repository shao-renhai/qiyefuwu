"""Analysis routes: combined client analysis view."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db, Client, User
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

    return {
        "client": client,
        "credit_reports": client.credit_reports,
        "bank_statements": client.bank_statements,
    }
