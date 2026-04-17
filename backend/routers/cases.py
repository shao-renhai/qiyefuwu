"""案例库 API：种子库 MVP。包含 CRUD + 工作流（工作流见 Task 5）。"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db, User, Case
from services.auth import get_current_user
from services.permissions import require_role

router = APIRouter(prefix="/api/cases", tags=["cases"])


# ---------- Schemas ----------
class CaseCreate(BaseModel):
    narrative: str
    customer_id: Optional[int] = None
    industry: str
    company_size: Optional[str] = None
    company_age: Optional[int] = None
    credit_status: Optional[str] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    visit_reason: Optional[str] = None
    core_problem: Optional[str] = None
    urgency: Optional[str] = None
    target_amount: Optional[float] = None
    solution_type: Optional[str] = None
    recommended_bank: Optional[str] = None
    preparation_actions: Optional[str] = None
    duration_days: Optional[int] = None
    outcome: Optional[str] = None
    approved_amount: Optional[float] = None
    actual_rate: Optional[float] = None
    bank_tier: Optional[str] = None
    core_lessons: Optional[str] = None
    status: str = "draft"
    tier: str = "seed"


class CaseUpdate(BaseModel):
    narrative: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    company_age: Optional[int] = None
    credit_status: Optional[str] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    visit_reason: Optional[str] = None
    core_problem: Optional[str] = None
    urgency: Optional[str] = None
    target_amount: Optional[float] = None
    solution_type: Optional[str] = None
    recommended_bank: Optional[str] = None
    preparation_actions: Optional[str] = None
    duration_days: Optional[int] = None
    outcome: Optional[str] = None
    approved_amount: Optional[float] = None
    actual_rate: Optional[float] = None
    bank_tier: Optional[str] = None
    core_lessons: Optional[str] = None


class CaseOut(BaseModel):
    id: int
    narrative: str
    customer_id: Optional[int]
    industry: Optional[str]
    company_size: Optional[str]
    company_age: Optional[int]
    credit_status: Optional[str]
    monthly_cashflow: Optional[float]
    has_tax_record: Optional[bool]
    collateral_type: Optional[str]
    collateral_value: Optional[float]
    visit_reason: Optional[str]
    core_problem: Optional[str]
    urgency: Optional[str]
    target_amount: Optional[float]
    solution_type: Optional[str]
    recommended_bank: Optional[str]
    preparation_actions: Optional[str]
    duration_days: Optional[int]
    outcome: Optional[str]
    approved_amount: Optional[float]
    actual_rate: Optional[float]
    bank_tier: Optional[str]
    core_lessons: Optional[str]
    status: str
    tier: str
    review_notes: Optional[str]
    published_at: Optional[datetime]
    created_by_id: Optional[int]
    reviewed_by_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Helpers ----------
def _can_read_case(user: User, case: Case) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    if case.status == "published":
        return True
    return case.created_by_id == user.id


def _can_write_case(user: User, case: Case) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    # 顾问只能改自己的草稿
    return case.created_by_id == user.id and case.status in ("draft", "pending_review")


# ---------- Endpoints ----------
@router.post("", response_model=CaseOut)
def create_case(
    body: CaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["founder", "consultant"])),
):
    role = (user.role or "consultant").lower()
    data = body.model_dump()
    # 顾问无法直接发布——降级为草稿
    if role != "founder" and data.get("status") == "published":
        data["status"] = "draft"

    published_at = datetime.utcnow() if data.get("status") == "published" else None
    case = Case(
        user_id=user.id,
        created_by_id=user.id,
        reviewed_by_id=user.id if data.get("status") == "published" else None,
        published_at=published_at,
        **data,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("", response_model=List[CaseOut])
def list_cases(
    status: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    q = db.query(Case)
    if role != "founder":
        q = q.filter(
            (Case.created_by_id == user.id) | (Case.status == "published")
        )
    if status:
        q = q.filter(Case.status == status)
    if industry:
        q = q.filter(Case.industry == industry)
    if tier:
        q = q.filter(Case.tier == tier)
    return q.order_by(Case.created_at.desc()).all()


@router.get("/{case_id}", response_model=CaseOut)
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if not _can_read_case(user, case):
        raise HTTPException(403, "无权查看此案例")
    return case


@router.put("/{case_id}", response_model=CaseOut)
def update_case(
    case_id: int,
    body: CaseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if not _can_write_case(user, case):
        raise HTTPException(403, "无权修改此案例")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(case, k, v)
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.delete("/{case_id}")
def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if not _can_write_case(user, case):
        raise HTTPException(403, "无权删除此案例")
    db.delete(case)
    db.commit()
    return {"ok": True}


# ---------- 工作流 Schemas ----------
class RejectBody(BaseModel):
    review_notes: str


# ---------- 工作流 Endpoints ----------
@router.post("/{case_id}/submit", response_model=CaseOut)
def submit_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and case.created_by_id != user.id:
        raise HTTPException(403, "无权提交此案例")
    if case.status != "draft":
        raise HTTPException(400, f"案例状态为 {case.status}，无法提交")
    case.status = "pending_review"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/publish", response_model=CaseOut)
def publish_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if case.status not in ("draft", "pending_review"):
        raise HTTPException(400, f"案例状态为 {case.status}，无法发布")
    case.status = "published"
    case.reviewed_by_id = user.id
    case.published_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/reject", response_model=CaseOut)
def reject_case(
    case_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if case.status != "pending_review":
        raise HTTPException(400, f"案例状态为 {case.status}，无法打回")
    case.status = "draft"
    case.review_notes = body.review_notes
    case.reviewed_by_id = user.id
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/archive", response_model=CaseOut)
def archive_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    case.status = "archived"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


# ---------- 从客户生成案例 ----------
class FromCustomerBody(BaseModel):
    narrative: str
    visit_reason: Optional[str] = None
    core_problem: Optional[str] = None
    urgency: Optional[str] = None
    solution_type: Optional[str] = None
    recommended_bank: Optional[str] = None
    preparation_actions: Optional[str] = None
    duration_days: Optional[int] = None
    outcome: Optional[str] = None
    approved_amount: Optional[float] = None
    actual_rate: Optional[float] = None
    bank_tier: Optional[str] = None
    core_lessons: Optional[str] = None


@router.post("/from-customer/{customer_id}", response_model=CaseOut)
def create_case_from_customer(
    customer_id: int,
    body: FromCustomerBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["founder", "consultant"])),
):
    from db.database import Customer
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and customer.created_by_id != user.id and customer.assigned_to_id != user.id:
        raise HTTPException(403, "无权从该客户生成案例")

    case = Case(
        user_id=user.id,
        created_by_id=user.id,
        customer_id=customer_id,
        narrative=body.narrative,
        industry=customer.industry or "未分类",
        company_size=customer.company_size,
        company_age=customer.company_age,
        credit_status=customer.credit_status,
        monthly_cashflow=customer.monthly_cashflow,
        has_tax_record=customer.has_tax_record,
        collateral_type=customer.collateral_type,
        collateral_value=customer.collateral_value,
        target_amount=customer.target_amount,
        visit_reason=body.visit_reason,
        core_problem=body.core_problem,
        urgency=body.urgency,
        solution_type=body.solution_type,
        recommended_bank=body.recommended_bank,
        preparation_actions=body.preparation_actions,
        duration_days=body.duration_days,
        outcome=body.outcome,
        approved_amount=body.approved_amount,
        actual_rate=body.actual_rate,
        bank_tier=body.bank_tier,
        core_lessons=body.core_lessons,
        status="draft",
        tier="seed",
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case
