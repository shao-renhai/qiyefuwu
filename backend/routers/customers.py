"""客户漏斗 API：意向池(lead) → 接待(consulting) → 成交(closed_won)。"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db, User, Customer, CustomerInteraction
from services.auth import get_current_user
from services.permissions import require_role

router = APIRouter(prefix="/api/customers", tags=["customers"])


# ---------- Schemas ----------
class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    source: Optional[str] = None
    stage: str = "lead"
    intent_level: int = 3
    target_amount: Optional[float] = None
    next_follow_up_at: Optional[datetime] = None
    company_age: Optional[int] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    credit_status: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    source: Optional[str] = None
    stage: Optional[str] = None
    intent_level: Optional[int] = None
    target_amount: Optional[float] = None
    next_follow_up_at: Optional[datetime] = None
    company_age: Optional[int] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    credit_status: Optional[str] = None
    notes: Optional[str] = None


class CustomerOut(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    company_name: Optional[str]
    industry: Optional[str]
    company_size: Optional[str]
    source: Optional[str]
    stage: str
    intent_level: int
    target_amount: Optional[float]
    next_follow_up_at: Optional[datetime]
    company_age: Optional[int]
    monthly_cashflow: Optional[float]
    has_tax_record: Optional[bool]
    collateral_type: Optional[str]
    collateral_value: Optional[float]
    credit_status: Optional[str]
    notes: Optional[str]
    created_by_id: Optional[int]
    assigned_to_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class InteractionCreate(BaseModel):
    channel: str
    content: str
    intent_level_after: Optional[int] = None
    next_follow_up_at: Optional[datetime] = None


class InteractionOut(BaseModel):
    id: int
    customer_id: int
    channel: str
    content: str
    intent_level_after: Optional[int]
    next_follow_up_at: Optional[datetime]
    created_by_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class AssignBody(BaseModel):
    assigned_to_id: int


# ---------- Helpers ----------
def _can_write_customer(user: User, customer: Customer) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    if customer.created_by_id == user.id or customer.assigned_to_id == user.id:
        return True
    return False


# ---------- Endpoints ----------
@router.post("", response_model=CustomerOut)
def create_customer(
    body: CustomerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    # 电销只能录入 lead 阶段
    if role == "telesales" and body.stage != "lead":
        raise HTTPException(403, "电销只能录入意向(lead)阶段客户")

    customer = Customer(
        user_id=user.id,
        created_by_id=user.id,
        **body.model_dump(),
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=List[CustomerOut])
def list_customers(
    stage: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    q = db.query(Customer)
    if role != "founder":
        q = q.filter(
            (Customer.created_by_id == user.id) | (Customer.assigned_to_id == user.id)
        )
    if stage:
        q = q.filter(Customer.stage == stage)
    return q.order_by(Customer.created_at.desc()).all()


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户")
    return c


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    body: CustomerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c):
        raise HTTPException(403, "无权修改此客户")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c):
        raise HTTPException(403, "无权删除此客户")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/{customer_id}/assign", response_model=CustomerOut)
def assign_customer(
    customer_id: int,
    body: AssignBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    target = db.query(User).filter(User.id == body.assigned_to_id).first()
    if not target:
        raise HTTPException(404, "被分配用户不存在")
    c.assigned_to_id = body.assigned_to_id
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.post("/{customer_id}/interactions", response_model=InteractionOut)
def add_interaction(
    customer_id: int,
    body: InteractionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c):
        raise HTTPException(403, "无权为此客户添加跟进")
    interaction = CustomerInteraction(
        customer_id=customer_id,
        created_by_id=user.id,
        channel=body.channel,
        content=body.content,
        intent_level_after=body.intent_level_after,
        next_follow_up_at=body.next_follow_up_at,
    )
    db.add(interaction)
    # 同步更新客户主档
    if body.intent_level_after is not None:
        c.intent_level = body.intent_level_after
    if body.next_follow_up_at is not None:
        c.next_follow_up_at = body.next_follow_up_at
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(interaction)
    return interaction


@router.get("/{customer_id}/interactions", response_model=List[InteractionOut])
def list_interactions(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户跟进")
    return (
        db.query(CustomerInteraction)
        .filter(CustomerInteraction.customer_id == customer_id)
        .order_by(CustomerInteraction.created_at.desc())
        .all()
    )
