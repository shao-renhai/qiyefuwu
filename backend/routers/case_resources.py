"""V1 consent, file metadata, and analysis task skeleton API."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import (
    AnalysisTask,
    AuditLog,
    ConsentRecord,
    FinancingCase,
    UploadedFile,
    User,
    get_db,
)
from domain.enums import AnalysisTaskStatus, ConsentStatus, UploadedFileStatus, UserRole
from services.auth import get_current_user
from services.case_resource_service import (
    ensure_case_open,
    require_analysis_task_allowed,
    require_file_metadata_allowed,
    validate_consent_type,
    validate_task_status,
)

router = APIRouter(tags=["case_resources"])


class ConsentCreate(BaseModel):
    consent_type: str
    consent_version: str
    consent_text_snapshot: str
    authorized_by_name: str
    authorized_by_phone: Optional[str] = None
    authorized_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ConsentOut(BaseModel):
    id: int
    case_id: int
    customer_id: int
    consent_type: str
    consent_version: str
    consent_text_snapshot: str
    authorized_by_name: str
    authorized_by_phone: Optional[str]
    authorized_at: datetime
    expires_at: Optional[datetime]
    status: str
    created_by_id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class UploadedFileCreate(BaseModel):
    file_type: str
    file_name: str
    storage_key: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    sensitivity_level: str = "internal"


class UploadedFileOut(BaseModel):
    id: int
    case_id: int
    customer_id: int
    uploaded_by_id: int
    file_type: str
    file_name: str
    storage_key: str
    mime_type: Optional[str]
    file_size: Optional[int]
    sensitivity_level: str
    status: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class AnalysisTaskCreate(BaseModel):
    task_type: str
    file_id: Optional[int] = None


class AnalysisTaskStatusUpdate(BaseModel):
    status: str
    error_message: Optional[str] = None


class AnalysisTaskOut(BaseModel):
    id: int
    case_id: int
    customer_id: int
    file_id: Optional[int]
    task_type: str
    status: str
    requested_by_id: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


def _role(user: User) -> str:
    return (user.role or UserRole.CONSULTANT).lower()


def _can_access_case(user: User, case: FinancingCase) -> bool:
    role = _role(user)
    if role in {UserRole.FOUNDER, UserRole.ADMIN}:
        return True
    if role == UserRole.MANAGER:
        return bool(user.team_id and case.team_id == user.team_id)
    return case.created_by_id == user.id or case.assigned_to_id == user.id


def _get_visible_case(db: Session, case_id: int, user: User) -> FinancingCase:
    case = db.query(FinancingCase).filter(FinancingCase.id == case_id).first()
    if not case:
        raise HTTPException(404, "案件不存在")
    if not _can_access_case(user, case):
        raise HTTPException(403, "无权访问此案件")
    return case


def _audit(db: Session, user: User, action: str, resource_type: str, resource_id: int, details: dict):
    db.add(AuditLog(
        actor_id=user.id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
    ))


@router.post("/api/financing-cases/{case_id}/consents", response_model=ConsentOut)
def create_consent(
    case_id: int,
    body: ConsentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = _get_visible_case(db, case_id, user)
    ensure_case_open(case)
    validate_consent_type(body.consent_type)
    consent = ConsentRecord(
        case_id=case.id,
        customer_id=case.customer_id,
        consent_type=body.consent_type,
        consent_version=body.consent_version,
        consent_text_snapshot=body.consent_text_snapshot,
        authorized_by_name=body.authorized_by_name,
        authorized_by_phone=body.authorized_by_phone,
        authorized_at=body.authorized_at or datetime.utcnow(),
        expires_at=body.expires_at,
        status=ConsentStatus.ACTIVE,
        created_by_id=user.id,
    )
    db.add(consent)
    db.flush()
    _audit(db, user, "consent.create", "consent_record", consent.id, {"case_id": case.id})
    db.commit()
    db.refresh(consent)
    return consent


@router.get("/api/financing-cases/{case_id}/consents", response_model=List[ConsentOut])
def list_consents(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_visible_case(db, case_id, user)
    return (
        db.query(ConsentRecord)
        .filter(ConsentRecord.case_id == case_id)
        .order_by(ConsentRecord.created_at.desc())
        .all()
    )


@router.post("/api/consents/{consent_id}/void", response_model=ConsentOut)
def void_consent(
    consent_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    consent = db.query(ConsentRecord).filter(ConsentRecord.id == consent_id).first()
    if not consent:
        raise HTTPException(404, "授权记录不存在")
    _get_visible_case(db, consent.case_id, user)
    consent.status = ConsentStatus.VOIDED
    consent.updated_at = datetime.utcnow()
    _audit(db, user, "consent.void", "consent_record", consent.id, {"case_id": consent.case_id})
    db.commit()
    db.refresh(consent)
    return consent


@router.post("/api/financing-cases/{case_id}/files", response_model=UploadedFileOut)
def create_file_metadata(
    case_id: int,
    body: UploadedFileCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = _get_visible_case(db, case_id, user)
    ensure_case_open(case)
    require_file_metadata_allowed(db, case, body.file_type, body.sensitivity_level)
    file = UploadedFile(
        case_id=case.id,
        customer_id=case.customer_id,
        uploaded_by_id=user.id,
        file_type=body.file_type,
        file_name=body.file_name,
        storage_key=body.storage_key,
        mime_type=body.mime_type,
        file_size=body.file_size,
        sensitivity_level=body.sensitivity_level,
        status=UploadedFileStatus.RECORDED,
    )
    db.add(file)
    db.flush()
    _audit(db, user, "file_metadata.create", "uploaded_file", file.id, {"case_id": case.id})
    db.commit()
    db.refresh(file)
    return file


@router.get("/api/financing-cases/{case_id}/files", response_model=List[UploadedFileOut])
def list_case_files(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_visible_case(db, case_id, user)
    return (
        db.query(UploadedFile)
        .filter(UploadedFile.case_id == case_id)
        .order_by(UploadedFile.created_at.desc())
        .all()
    )


@router.get("/api/files/{file_id}", response_model=UploadedFileOut)
def get_file_metadata(
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file:
        raise HTTPException(404, "文件记录不存在")
    _get_visible_case(db, file.case_id, user)
    return file


@router.post("/api/financing-cases/{case_id}/analysis-tasks", response_model=AnalysisTaskOut)
def create_analysis_task(
    case_id: int,
    body: AnalysisTaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = _get_visible_case(db, case_id, user)
    ensure_case_open(case)
    require_analysis_task_allowed(db, case, body.task_type)
    if body.file_id is not None:
        file = db.query(UploadedFile).filter(UploadedFile.id == body.file_id).first()
        if not file or file.case_id != case.id:
            raise HTTPException(400, "file_id 不属于当前案件")
    task = AnalysisTask(
        case_id=case.id,
        customer_id=case.customer_id,
        file_id=body.file_id,
        task_type=body.task_type,
        status=AnalysisTaskStatus.PENDING,
        requested_by_id=user.id,
    )
    db.add(task)
    db.flush()
    _audit(db, user, "analysis_task.create", "analysis_task", task.id, {"case_id": case.id})
    db.commit()
    db.refresh(task)
    return task


@router.get("/api/financing-cases/{case_id}/analysis-tasks", response_model=List[AnalysisTaskOut])
def list_case_analysis_tasks(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_visible_case(db, case_id, user)
    return (
        db.query(AnalysisTask)
        .filter(AnalysisTask.case_id == case_id)
        .order_by(AnalysisTask.created_at.desc())
        .all()
    )


@router.get("/api/analysis-tasks/{task_id}", response_model=AnalysisTaskOut)
def get_analysis_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = db.query(AnalysisTask).filter(AnalysisTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "分析任务不存在")
    _get_visible_case(db, task.case_id, user)
    return task


@router.post("/api/analysis-tasks/{task_id}/status", response_model=AnalysisTaskOut)
def update_analysis_task_status(
    task_id: int,
    body: AnalysisTaskStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validate_task_status(body.status)
    task = db.query(AnalysisTask).filter(AnalysisTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "分析任务不存在")
    _get_visible_case(db, task.case_id, user)

    task.status = body.status
    task.error_message = body.error_message
    if body.status == AnalysisTaskStatus.RUNNING and task.started_at is None:
        task.started_at = datetime.utcnow()
    if body.status in {
        AnalysisTaskStatus.SUCCEEDED,
        AnalysisTaskStatus.FAILED,
        AnalysisTaskStatus.CANCELLED,
    }:
        task.finished_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    _audit(db, user, "analysis_task.status.update", "analysis_task", task.id, {
        "status": body.status,
        "error_message": body.error_message,
    })
    db.commit()
    db.refresh(task)
    return task
