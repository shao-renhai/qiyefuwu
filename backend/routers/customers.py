"""V1 客户中心 API：客户池、跟进、状态流转与自动灯色。"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import AuditLog, CustomerContact, get_db, User, Customer, CustomerInteraction
from domain.enums import CloseResult, ConsultingStatus, CustomerPool, LeadStatus
from services.auth import get_current_user
from services.customer_signal import apply_signal
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
    pool: Optional[str] = None
    lead_status: str = "new"
    consulting_status: str = "not_visited"
    close_result: Optional[str] = None
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
    pool: Optional[str] = None
    lead_status: Optional[str] = None
    consulting_status: Optional[str] = None
    close_result: Optional[str] = None
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
    pool: str
    lead_status: str
    consulting_status: str
    close_result: Optional[str]
    signal_color: str
    signal_reason_code: str
    signal_updated_at: Optional[datetime]
    intent_level: int
    target_amount: Optional[float]
    next_follow_up_at: Optional[datetime]
    last_followup_at: Optional[datetime]
    visited_at: Optional[datetime]
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
    lead_status_after: Optional[str] = None
    consulting_status_after: Optional[str] = None
    close_result_after: Optional[str] = None
    next_pool: Optional[str] = None
    next_follow_up_at: Optional[datetime] = None


class InteractionOut(BaseModel):
    id: int
    customer_id: int
    channel: str
    content: str
    intent_level_after: Optional[int]
    lead_status_after: Optional[str]
    consulting_status_after: Optional[str]
    close_result_after: Optional[str]
    next_pool: Optional[str]
    next_follow_up_at: Optional[datetime]
    created_by_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class AssignBody(BaseModel):
    assigned_to_id: int


class CustomerContactCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    title: Optional[str] = None
    relation: Optional[str] = None
    is_primary: bool = False


class CustomerContactOut(BaseModel):
    id: int
    customer_id: int
    name: str
    phone: Optional[str]
    title: Optional[str]
    relation: Optional[str]
    is_primary: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Helpers ----------
def _can_write_customer(user: User, customer: Customer) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    if customer.created_by_id == user.id or customer.assigned_to_id == user.id:
        return True
    return False


def _enum_values(enum_cls) -> set[str]:
    return {item.value for item in enum_cls}


def _validate_customer_state(payload: dict):
    validators = {
        "pool": CustomerPool,
        "stage": CustomerPool,
        "lead_status": LeadStatus,
        "consulting_status": ConsultingStatus,
        "close_result": CloseResult,
        "next_pool": CustomerPool,
        "lead_status_after": LeadStatus,
        "consulting_status_after": ConsultingStatus,
        "close_result_after": CloseResult,
    }
    for key, enum_cls in validators.items():
        value = payload.get(key)
        if value is not None and value not in _enum_values(enum_cls):
            raise HTTPException(400, f"{key} 不合法: {value}")


def _audit(db: Session, user: User, action: str, resource_id: Optional[int], details: dict):
    db.add(AuditLog(
        actor_id=user.id if user else None,
        action=action,
        resource_type="customer",
        resource_id=resource_id,
        details=details,
    ))


def _sync_stage_pool(customer: Customer):
    if customer.pool:
        customer.stage = customer.pool
    elif customer.stage:
        customer.pool = customer.stage


def _get_visible_customer(db: Session, customer_id: int, user: User) -> Customer:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户")
    return c


# ---------- Endpoints ----------
@router.post("", response_model=CustomerOut)
def create_customer(
    body: CustomerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    payload = body.model_dump()
    payload["pool"] = payload.get("pool") or payload.get("stage") or CustomerPool.LEAD
    payload["stage"] = payload["pool"]
    _validate_customer_state(payload)
    # 电销只能录入 lead 阶段
    if role == "telesales" and payload["pool"] != CustomerPool.LEAD:
        raise HTTPException(403, "电销只能录入意向(lead)阶段客户")

    customer = Customer(
        user_id=user.id,
        created_by_id=user.id,
        team_id=user.team_id,
        **payload,
    )
    apply_signal(customer)
    db.add(customer)
    db.flush()
    _audit(db, user, "customer.create", customer.id, {"pool": customer.pool})
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=List[CustomerOut])
def list_customers(
    stage: Optional[str] = Query(None),
    pool: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    q = db.query(Customer)
    if role != "founder":
        q = q.filter(
            (Customer.created_by_id == user.id) | (Customer.assigned_to_id == user.id)
        )
    if stage or pool:
        filter_pool = pool or stage
        if filter_pool not in _enum_values(CustomerPool):
            raise HTTPException(400, "客户池不合法")
        q = q.filter(Customer.pool == filter_pool)
    return q.order_by(Customer.created_at.desc()).all()


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _get_visible_customer(db, customer_id, user)


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
    payload = body.model_dump(exclude_unset=True)
    if "stage" in payload and "pool" not in payload:
        payload["pool"] = payload["stage"]
    if "pool" in payload:
        payload["stage"] = payload["pool"]
    _validate_customer_state(payload)
    for k, v in payload.items():
        setattr(c, k, v)
    _sync_stage_pool(c)
    apply_signal(c)
    c.updated_at = datetime.utcnow()
    _audit(db, user, "customer.update", c.id, payload)
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
    apply_signal(c)
    _audit(db, user, "customer.assign", c.id, {"assigned_to_id": body.assigned_to_id})
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
    payload = body.model_dump()
    _validate_customer_state(payload)
    interaction = CustomerInteraction(
        customer_id=customer_id,
        created_by_id=user.id,
        **payload,
    )
    db.add(interaction)
    # 同步更新客户主档
    if body.intent_level_after is not None:
        c.intent_level = body.intent_level_after
    if body.lead_status_after is not None:
        c.lead_status = body.lead_status_after
    if body.consulting_status_after is not None:
        c.consulting_status = body.consulting_status_after
        if body.consulting_status_after == ConsultingStatus.VISITED and c.visited_at is None:
            c.visited_at = datetime.utcnow()
    if body.close_result_after is not None:
        c.close_result = body.close_result_after
    if body.next_pool is not None:
        c.pool = body.next_pool
        c.stage = body.next_pool
    if body.next_follow_up_at is not None:
        c.next_follow_up_at = body.next_follow_up_at
    c.last_followup_at = datetime.utcnow()
    apply_signal(c)
    c.updated_at = datetime.utcnow()
    _audit(db, user, "customer.followup.create", c.id, payload)
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


@router.post("/{customer_id}/contacts", response_model=CustomerContactOut)
def add_contact(
    customer_id: int,
    body: CustomerContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _get_visible_customer(db, customer_id, user)
    if not _can_write_customer(user, c):
        raise HTTPException(403, "无权为此客户添加联系人")
    contact = CustomerContact(customer_id=customer_id, **body.model_dump())
    db.add(contact)
    _audit(db, user, "customer.contact.create", c.id, body.model_dump())
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{customer_id}/contacts", response_model=List[CustomerContactOut])
def list_contacts(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_visible_customer(db, customer_id, user)
    return (
        db.query(CustomerContact)
        .filter(CustomerContact.customer_id == customer_id)
        .order_by(CustomerContact.is_primary.desc(), CustomerContact.created_at.asc())
        .all()
    )
