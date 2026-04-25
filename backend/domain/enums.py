"""Centralized V1 domain enums."""

from enum import StrEnum


class UserRole(StrEnum):
    FOUNDER = "founder"
    ADMIN = "admin"
    MANAGER = "manager"
    CONSULTANT = "consultant"
    TELESALES = "telesales"


class CustomerPool(StrEnum):
    LEAD = "lead"
    CONSULTING = "consulting"
    CLOSED = "closed"


class LeadStatus(StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    APPOINTMENT_SCHEDULED = "appointment_scheduled"
    INVALID = "invalid"
    NO_NEED = "no_need"


class ConsultingStatus(StrEnum):
    NOT_VISITED = "not_visited"
    VISITED = "visited"
    NEEDS_ANALYSIS = "needs_analysis"
    PLAN_MADE = "plan_made"
    APPROVED = "approved"
    REJECTED = "rejected"
    UNQUALIFIED = "unqualified"


class CloseResult(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    NO_RESPONSE = "no_response"
    NOT_QUALIFIED = "not_qualified"
    CANCELED = "canceled"


class SignalColor(StrEnum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class SignalReasonCode(StrEnum):
    NEW_LEAD = "new_lead"
    FOLLOWUP_OVERDUE = "followup_overdue"
    LOW_INTENT = "low_intent"
    HIGH_INTENT = "high_intent"
    APPOINTMENT_SCHEDULED = "appointment_scheduled"
    VISITED = "visited"
    CONSULTING_ACTIVE = "consulting_active"
    RISK_REJECTED = "risk_rejected"
    CLOSED_SUCCESS = "closed_success"
    CLOSED_FAILED = "closed_failed"
    CLOSED_NO_RESPONSE = "closed_no_response"


class FinancingCaseStatus(StrEnum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    WAITING_MATERIALS = "waiting_materials"
    ANALYSIS_PENDING = "analysis_pending"
    SOLUTION_PENDING = "solution_pending"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    CLOSED = "closed"


class FinancingCaseCloseResult(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    ABANDONED = "abandoned"
    WITHDRAWN = "withdrawn"


class ConsentType(StrEnum):
    CREDIT_REPORT = "credit_report"
    BANK_STATEMENT = "bank_statement"
    DIAGNOSIS = "diagnosis"
    GENERAL = "general"


class ConsentStatus(StrEnum):
    ACTIVE = "active"
    VOIDED = "voided"
    EXPIRED = "expired"


class FileType(StrEnum):
    CREDIT_REPORT = "credit_report"
    BANK_STATEMENT = "bank_statement"
    BUSINESS_LICENSE = "business_license"
    IDENTITY_DOCUMENT = "identity_document"
    OTHER = "other"


class FileSensitivityLevel(StrEnum):
    PUBLIC = "public"
    INTERNAL = "internal"
    SENSITIVE = "sensitive"


class UploadedFileStatus(StrEnum):
    RECORDED = "recorded"
    VOIDED = "voided"


class AnalysisTaskType(StrEnum):
    CREDIT_ANALYSIS = "credit_analysis"
    BANK_STATEMENT_ANALYSIS = "bank_statement_analysis"
    DIAGNOSIS = "diagnosis"


class AnalysisTaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
