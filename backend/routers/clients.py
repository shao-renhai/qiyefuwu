"""Client management routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db, Client
from models.schemas import ClientCreate, ClientResponse

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.post("/", response_model=ClientResponse)
def create_client(client_data: ClientCreate, db: Session = Depends(get_db)):
    client = Client(name=client_data.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/", response_model=list[ClientResponse])
def list_clients(db: Session = Depends(get_db)):
    return db.query(Client).all()


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client
