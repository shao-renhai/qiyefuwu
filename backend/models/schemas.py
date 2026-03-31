from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ClientCreate(BaseModel):
    name: str


class ClientResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class CreditReportData(BaseModel):
    total_debt: float = 0.0
    total_balance: float = 0.0
    institution_details: list[dict] = []
    credit_card_total_limit: float = 0.0
    credit_card_used: float = 0.0
    credit_card_usage_rate: float = 0.0
    active_loans: list[dict] = []
    overdue_records: list[dict] = []
    query_records: dict = {
        "recent_1m": {"loan_approval": 0, "corporate_review": 0},
        "recent_3m": {"loan_approval": 0, "corporate_review": 0},
        "recent_6m": {"loan_approval": 0, "corporate_review": 0},
        "recent_1y": {"loan_approval": 0, "corporate_review": 0},
    }


class CreditReportResponse(BaseModel):
    id: int
    client_id: int
    filename: str
    file_type: str
    parsed_data: Optional[CreditReportData] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionRecord(BaseModel):
    date: str
    counterparty: str = ""
    description: str = ""
    income: float = 0.0
    expense: float = 0.0
    balance: float = 0.0
    is_duplicate: bool = False
    duplicate_reason: str = ""


class BankAnalysisResult(BaseModel):
    # Raw totals
    total_income: float = 0.0
    total_expense: float = 0.0
    monthly_avg_income: float = 0.0
    monthly_avg_expense: float = 0.0
    monthly_avg_net: float = 0.0
    # Deduped totals
    deduped_total_income: float = 0.0
    deduped_total_expense: float = 0.0
    deduped_monthly_avg_income: float = 0.0
    deduped_monthly_avg_expense: float = 0.0
    # Fund flow
    top_income_sources: list[dict] = []
    top_expense_categories: list[dict] = []
    # Balance
    monthly_ending_balances: list[dict] = []
    min_balance: float = 0.0
    avg_balance: float = 0.0
    # Frequency
    monthly_avg_tx_count: float = 0.0
    daily_avg_tx_count: float = 0.0
    # Monthly breakdown
    monthly_summary: list[dict] = []
    # Anomalies
    anomalies: list[dict] = []


class BankStatementResponse(BaseModel):
    id: int
    client_id: int
    filename: str
    bank_name: Optional[str] = None
    analysis: Optional[BankAnalysisResult] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FullAnalysisResponse(BaseModel):
    client: ClientResponse
    credit_reports: list[CreditReportResponse] = []
    bank_statements: list[BankStatementResponse] = []
