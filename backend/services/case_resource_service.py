"""Consent, file metadata, and analysis task guard rules for V1."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from db.database import ConsentRecord, FinancingCase
from domain.enums import (
    AnalysisTaskStatus,
    AnalysisTaskType,
    ConsentStatus,
    ConsentType,
    FileSensitivityLevel,
    FileType,
    FinancingCaseStatus,
    UploadedFileStatus,
)


SENSITIVE_FILE_TYPES = {
    FileType.CREDIT_REPORT,
    FileType.BANK_STATEMENT,
    FileType.IDENTITY_DOCUMENT,
}

SENSITIVE_TASK_TYPES = {
    AnalysisTaskType.CREDIT_ANALYSIS,
    AnalysisTaskType.BANK_STATEMENT_ANALYSIS,
    AnalysisTaskType.DIAGNOSIS,
}

TASK_CONSENT_TYPES = {
    AnalysisTaskType.CREDIT_ANALYSIS: ConsentType.CREDIT_REPORT,
    AnalysisTaskType.BANK_STATEMENT_ANALYSIS: ConsentType.BANK_STATEMENT,
    AnalysisTaskType.DIAGNOSIS: ConsentType.DIAGNOSIS,
}

FILE_CONSENT_TYPES = {
    FileType.CREDIT_REPORT: ConsentType.CREDIT_REPORT,
    FileType.BANK_STATEMENT: ConsentType.BANK_STATEMENT,
    FileType.IDENTITY_DOCUMENT: ConsentType.GENERAL,
}


def enum_values(enum_cls) -> set[str]:
    return {item.value for item in enum_cls}


def validate_enum(value: str, enum_cls, field_name: str):
    if value not in enum_values(enum_cls):
        raise HTTPException(400, f"{field_name} 不合法: {value}")


def ensure_case_open(case: FinancingCase):
    if case.status == FinancingCaseStatus.CLOSED:
        raise HTTPException(400, "案件已关闭，不能新增授权、文件或分析任务")


def has_valid_consent(
    db: Session,
    case_id: int,
    customer_id: int,
    consent_type: str,
    now: datetime | None = None,
) -> bool:
    now = now or datetime.utcnow()
    query = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.case_id == case_id)
        .filter(ConsentRecord.customer_id == customer_id)
        .filter(ConsentRecord.consent_type == consent_type)
        .filter(ConsentRecord.status == ConsentStatus.ACTIVE)
    )
    for consent in query.all():
        if consent.expires_at is None or consent.expires_at > now:
            return True
    return False


def require_valid_consent(db: Session, case: FinancingCase, consent_type: str):
    if not has_valid_consent(db, case.id, case.customer_id, consent_type):
        raise HTTPException(403, f"缺少有效授权，不能创建敏感资料或分析任务: {consent_type}")


def require_file_metadata_allowed(db: Session, case: FinancingCase, file_type: str, sensitivity_level: str):
    validate_enum(file_type, FileType, "file_type")
    validate_enum(sensitivity_level, FileSensitivityLevel, "sensitivity_level")
    if file_type in SENSITIVE_FILE_TYPES or sensitivity_level == FileSensitivityLevel.SENSITIVE:
        require_valid_consent(db, case, FILE_CONSENT_TYPES.get(file_type, ConsentType.GENERAL))


def require_analysis_task_allowed(db: Session, case: FinancingCase, task_type: str):
    validate_enum(task_type, AnalysisTaskType, "task_type")
    if task_type in SENSITIVE_TASK_TYPES:
        require_valid_consent(db, case, TASK_CONSENT_TYPES[task_type])


def validate_consent_type(consent_type: str):
    validate_enum(consent_type, ConsentType, "consent_type")


def validate_file_status(status: str):
    validate_enum(status, UploadedFileStatus, "file_status")


def validate_task_status(status: str):
    validate_enum(status, AnalysisTaskStatus, "task_status")
