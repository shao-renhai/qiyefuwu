"""V1 financing case center API."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import AuditLog, CaseStatusLog, Customer, FinancingCase, User, get_db
from domain.enums import FinancingCaseStatus, UserRole
from services.auth import get_current_user
from services.financing_case_service import (
    generate_case_no,
    validate_case_status,
    validate_close_result,
    validate_transition,
)

router = APIRouter(tags=["financing_cases"])


class FinancingCaseCreate(BaseModel):
    title: str
    assigned_to_id: Optional[int] = None
    loan_purpose: Optional[str] = None
    target_amount: Optional[float] = None
    target_term_months: Optional[int] = None
    urgency_level: Optional[str] = None
    description: Optional[str] = None


class FinancingCaseUpdate(BaseModel):
    title: Optional[str] = None
    assigned_to_id: Optional[int] = None
    loan_purpose: Optional[str] = None
    target_amount: Optional[float] = None
    target_term_months: Optional[int] = None
    urgency_level: Optional[str] = None
    description: Optional[str] = None


class FinancingCaseStatusUpdate(BaseModel):
    to_status: str
    change_reason: Optional[str] = None
    close_result: Optional[str] = None


class FinancingCaseOut(BaseModel):
    id: int
    customer_id: int
    created_by_id: int
    assigned_to_id: Optional[int]
    team_id: Optional[int]
    case_no: str
    title: str
    status: str
    loan_purpose: Optional[str]
    target_amount: Optional[float]
    target_term_months: Optional[int]
    urgency_level: Optional[str]
    description: Optional[str]
    close_result: Optional[str]
    closed_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class CaseStatusLogOut(BaseModel):
    id: int
    case_id: int
    from_status: Optional[str]
    to_status: str
    changed_by_id: int
    change_reason: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


def _role(user: User) -> str:
    return (user.role or UserRole.CONSULTANT).lower()


def _can_access_customer(user: User, customer: Customer) -> bool:
    role = _role(user)
    if role in {UserRole.FOUNDER, UserRole.ADMIN}:
        return True
    if role == UserRole.MANAGER:
        return bool(user.team_id and customer.team_id == user.team_id)
    return customer.created_by_id == user.id or customer.assigned_to_id == user.id


def _can_access_case(user: User, case: FinancingCase) -> bool:
    role = _role(user)
    if role in {UserRole.FOUNDER, UserRole.ADMIN}:
        return True
    if role == UserRole.MANAGER:
        return bool(user.team_id and case.team_id == user.team_id)
    return case.created_by_id == user.id or case.assigned_to_id == user.id


def _get_visible_customer(db: Session, customer_id: int, user: User) -> Customer:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(404, "客户不存在")
    if not _can_access_customer(user, customer):
        raise HTTPException(403, "无权访问此客户")
    return customer


def _get_visible_case(db: Session, case_id: int, user: User) -> FinancingCase:
    case = db.query(FinancingCase).filter(FinancingCase.id == case_id).first()
    if not case:
        raise HTTPException(404, "案件不存在")
    if not _can_access_case(user, case):
        raise HTTPException(403, "无权访问此案件")
    if not _can_access_customer(user, case.customer):
        raise HTTPException(403, "无权访问此客户下的案件")
    return case


def _audit(db: Session, user: User, action: str, case_id: int, details: dict):
    db.add(AuditLog(
        actor_id=user.id,
        action=action,
        resource_type="financing_case",
        resource_id=case_id,
        details=details,
    ))


@router.post("/api/customers/{customer_id}/financing-cases", response_model=FinancingCaseOut)
def create_financing_case(
    customer_id: int,
    body: FinancingCaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    customer = _get_visible_customer(db, customer_id, user)
    assigned_to_id = body.assigned_to_id or customer.assigned_to_id or user.id
    case = FinancingCase(
        customer_id=customer.id,
        created_by_id=user.id,
        assigned_to_id=assigned_to_id,
        team_id=customer.team_id or user.team_id,
        case_no=generate_case_no(),
        status=FinancingCaseStatus.DRAFT,
        title=body.title,
        loan_purpose=body.loan_purpose,
        target_amount=body.target_amount,
        target_term_months=body.target_term_months,
        urgency_level=body.urgency_level,
        description=body.description,
    )
    db.add(case)
    db.flush()
    _audit(db, user, "financing_case.create", case.id, {"customer_id": customer.id})
    db.commit()
    db.refresh(case)
    return case


@router.get("/api/financing-cases", response_model=List[FinancingCaseOut])
def list_financing_cases(
    status: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if status:
        validate_case_status(status)
    q = db.query(FinancingCase).join(Customer)
    role = _role(user)
    if role not in {UserRole.FOUNDER, UserRole.ADMIN}:
        if role == UserRole.MANAGER:
            q = q.filter(FinancingCase.team_id == user.team_id)
        else:
            q = q.filter(
                (FinancingCase.created_by_id == user.id) |
                (FinancingCase.assigned_to_id == user.id)
            )
    if status:
        q = q.filter(FinancingCase.status == status)
    if customer_id:
        _get_visible_customer(db, customer_id, user)
        q = q.filter(FinancingCase.customer_id == customer_id)
    return q.order_by(FinancingCase.created_at.desc()).all()


@router.get("/api/financing-cases/{case_id}", response_model=FinancingCaseOut)
def get_financing_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _get_visible_case(db, case_id, user)


@router.patch("/api/financing-cases/{case_id}", response_model=FinancingCaseOut)
def update_financing_case(
    case_id: int,
    body: FinancingCaseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = _get_visible_case(db, case_id, user)
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(case, key, value)
    case.updated_at = datetime.utcnow()
    _audit(db, user, "financing_case.update", case.id, payload)
    db.commit()
    db.refresh(case)
    return case


@router.post("/api/financing-cases/{case_id}/status", response_model=FinancingCaseOut)
def change_financing_case_status(
    case_id: int,
    body: FinancingCaseStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = _get_visible_case(db, case_id, user)
    validate_transition(case.status, body.to_status)
    validate_close_result(body.close_result)

    if body.to_status == FinancingCaseStatus.CLOSED:
        if not body.close_result:
            raise HTTPException(400, "关闭案件必须填写 close_result")
        case.close_result = body.close_result
        case.closed_at = datetime.utcnow()
    else:
        if body.close_result is not None:
            raise HTTPException(400, "非 closed 状态下 close_result 必须为空")
        case.close_result = None
        case.closed_at = None

    from_status = case.status
    case.status = body.to_status
    case.updated_at = datetime.utcnow()
    db.add(CaseStatusLog(
        case_id=case.id,
        from_status=from_status,
        to_status=body.to_status,
        changed_by_id=user.id,
        change_reason=body.change_reason,
    ))
    _audit(db, user, "financing_case.status.change", case.id, {
        "from_status": from_status,
        "to_status": body.to_status,
        "change_reason": body.change_reason,
        "close_result": body.close_result,
    })
    db.commit()
    db.refresh(case)
    return case


@router.get("/api/financing-cases/{case_id}/status-logs", response_model=List[CaseStatusLogOut])
def list_case_status_logs(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_visible_case(db, case_id, user)
    return (
        db.query(CaseStatusLog)
        .filter(CaseStatusLog.case_id == case_id)
        .order_by(CaseStatusLog.created_at.asc())
        .all()
    )
