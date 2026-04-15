"""Client management routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from db.database import get_db, Client, User
from services.auth import get_current_user

router = APIRouter(prefix="/api/clients", tags=["clients"])


class ClientCreate(BaseModel):
    name: str
    company_name: str = ""


class ClientResponse(BaseModel):
    id: int
    name: str
    company_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/", response_model=ClientResponse)
def create_client(
    client_data: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 同名客户自动复用，防止重复创建
    existing = db.query(Client).filter(
        Client.user_id == current_user.id,
        Client.name == client_data.name,
    ).first()
    if existing:
        # 更新 company_name（如果传了新值且旧值为空）
        if client_data.company_name and not existing.company_name:
            existing.company_name = client_data.company_name
            db.commit()
            db.refresh(existing)
        return existing

    client = Client(
        name=client_data.name,
        company_name=client_data.company_name,
        user_id=current_user.id,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/", response_model=list[ClientResponse])
def list_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Client).filter(Client.user_id == current_user.id).order_by(Client.created_at.desc()).all()


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(
        Client.id == client_id,
        Client.user_id == current_user.id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client
