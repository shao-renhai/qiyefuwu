"""Pure customer signal rules for V1."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from domain.enums import (
    CloseResult,
    ConsultingStatus,
    CustomerPool,
    LeadStatus,
    SignalColor,
    SignalReasonCode,
)


@dataclass(frozen=True)
class CustomerSignalInput:
    pool: str = CustomerPool.LEAD
    lead_status: str = LeadStatus.NEW
    consulting_status: str = ConsultingStatus.NOT_VISITED
    close_result: Optional[str] = None
    intent_level: int = 3
    next_follow_up_at: Optional[datetime] = None
    visited_at: Optional[datetime] = None


@dataclass(frozen=True)
class CustomerSignalResult:
    signal_color: SignalColor
    signal_reason_code: SignalReasonCode


class CustomerSignalService:
    """Calculate signal color/reason without database side effects."""

    @staticmethod
    def calculate(data: CustomerSignalInput, now: Optional[datetime] = None) -> CustomerSignalResult:
        now = now or datetime.utcnow()

        if data.pool == CustomerPool.CLOSED:
            if data.close_result == CloseResult.SUCCESS:
                return CustomerSignalResult(SignalColor.GREEN, SignalReasonCode.CLOSED_SUCCESS)
            if data.close_result == CloseResult.NO_RESPONSE:
                return CustomerSignalResult(SignalColor.RED, SignalReasonCode.CLOSED_NO_RESPONSE)
            return CustomerSignalResult(SignalColor.RED, SignalReasonCode.CLOSED_FAILED)

        if data.close_result in {
            CloseResult.FAILED,
            CloseResult.NO_RESPONSE,
            CloseResult.NOT_QUALIFIED,
            CloseResult.CANCELED,
        }:
            return CustomerSignalResult(SignalColor.RED, SignalReasonCode.CLOSED_FAILED)

        if data.lead_status in {LeadStatus.INVALID, LeadStatus.NO_NEED}:
            return CustomerSignalResult(SignalColor.RED, SignalReasonCode.LOW_INTENT)

        if data.consulting_status in {ConsultingStatus.REJECTED, ConsultingStatus.UNQUALIFIED}:
            return CustomerSignalResult(SignalColor.RED, SignalReasonCode.RISK_REJECTED)

        if data.next_follow_up_at and data.next_follow_up_at < now:
            return CustomerSignalResult(SignalColor.RED, SignalReasonCode.FOLLOWUP_OVERDUE)

        if data.pool == CustomerPool.CONSULTING:
            if data.visited_at or data.consulting_status == ConsultingStatus.VISITED:
                return CustomerSignalResult(SignalColor.GREEN, SignalReasonCode.VISITED)
            if data.consulting_status in {
                ConsultingStatus.NEEDS_ANALYSIS,
                ConsultingStatus.PLAN_MADE,
                ConsultingStatus.APPROVED,
            }:
                return CustomerSignalResult(SignalColor.GREEN, SignalReasonCode.CONSULTING_ACTIVE)
            return CustomerSignalResult(SignalColor.YELLOW, SignalReasonCode.CONSULTING_ACTIVE)

        if data.lead_status == LeadStatus.APPOINTMENT_SCHEDULED:
            return CustomerSignalResult(SignalColor.GREEN, SignalReasonCode.APPOINTMENT_SCHEDULED)

        if data.lead_status == LeadStatus.QUALIFIED or data.intent_level >= 4:
            return CustomerSignalResult(SignalColor.GREEN, SignalReasonCode.HIGH_INTENT)

        if data.intent_level <= 2:
            return CustomerSignalResult(SignalColor.YELLOW, SignalReasonCode.LOW_INTENT)

        return CustomerSignalResult(SignalColor.YELLOW, SignalReasonCode.NEW_LEAD)


def input_from_customer(customer) -> CustomerSignalInput:
    return CustomerSignalInput(
        pool=customer.pool or customer.stage or CustomerPool.LEAD,
        lead_status=customer.lead_status or LeadStatus.NEW,
        consulting_status=customer.consulting_status or ConsultingStatus.NOT_VISITED,
        close_result=customer.close_result,
        intent_level=customer.intent_level or 3,
        next_follow_up_at=customer.next_follow_up_at,
        visited_at=customer.visited_at,
    )


def apply_signal(customer, now: Optional[datetime] = None):
    result = CustomerSignalService.calculate(input_from_customer(customer), now=now)
    customer.signal_color = result.signal_color.value
    customer.signal_reason_code = result.signal_reason_code.value
    customer.signal_updated_at = now or datetime.utcnow()
    return result
