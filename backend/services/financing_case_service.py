"""V1 financing case status rules and helpers."""

import uuid
from datetime import datetime

from fastapi import HTTPException

from domain.enums import FinancingCaseCloseResult, FinancingCaseStatus


ALLOWED_CASE_STATUS_TRANSITIONS: dict[str, set[str]] = {
    FinancingCaseStatus.DRAFT: {FinancingCaseStatus.IN_PROGRESS},
    FinancingCaseStatus.IN_PROGRESS: {
        FinancingCaseStatus.WAITING_MATERIALS,
        FinancingCaseStatus.ANALYSIS_PENDING,
        FinancingCaseStatus.SOLUTION_PENDING,
        FinancingCaseStatus.CLOSED,
    },
    FinancingCaseStatus.WAITING_MATERIALS: {
        FinancingCaseStatus.ANALYSIS_PENDING,
        FinancingCaseStatus.CLOSED,
    },
    FinancingCaseStatus.ANALYSIS_PENDING: {
        FinancingCaseStatus.SOLUTION_PENDING,
        FinancingCaseStatus.CLOSED,
    },
    FinancingCaseStatus.SOLUTION_PENDING: {
        FinancingCaseStatus.SUBMITTED,
        FinancingCaseStatus.CLOSED,
    },
    FinancingCaseStatus.SUBMITTED: {
        FinancingCaseStatus.APPROVED,
        FinancingCaseStatus.REJECTED,
        FinancingCaseStatus.CLOSED,
    },
    FinancingCaseStatus.APPROVED: {FinancingCaseStatus.CLOSED},
    FinancingCaseStatus.REJECTED: {
        FinancingCaseStatus.SOLUTION_PENDING,
        FinancingCaseStatus.CLOSED,
    },
    FinancingCaseStatus.CLOSED: set(),
}


def enum_values(enum_cls) -> set[str]:
    return {item.value for item in enum_cls}


def generate_case_no(now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    return f"YSR-{now:%Y%m%d}-{uuid.uuid4().hex[:8]}"


def validate_case_status(status: str):
    if status not in enum_values(FinancingCaseStatus):
        raise HTTPException(400, f"案件状态不合法: {status}")


def validate_close_result(close_result: str | None):
    if close_result is not None and close_result not in enum_values(FinancingCaseCloseResult):
        raise HTTPException(400, f"案件关闭结果不合法: {close_result}")


def validate_transition(from_status: str, to_status: str):
    validate_case_status(to_status)
    allowed = ALLOWED_CASE_STATUS_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise HTTPException(400, f"非法案件状态流转: {from_status} -> {to_status}")
