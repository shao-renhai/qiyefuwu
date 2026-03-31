# 企业融资数据智能分析工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web tool that lets financing consultants upload credit reports and bank statements, automatically parse and analyze them, and view/export structured reports.

**Architecture:** React + Ant Design frontend communicates via REST API with a Python FastAPI backend. Backend handles PDF/image parsing (pdfplumber + Tesseract OCR), Excel parsing (pandas), analysis logic, and export (openpyxl + reportlab). SQLite stores all data per client.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, pdfplumber, pytesseract, pandas, openpyxl, reportlab, React 18, TypeScript, Ant Design 5, @ant-design/charts, axios

**Prerequisites:** Install system dependencies: `brew install tesseract poppler tesseract-lang` (poppler for pdf2image, tesseract-lang for Chinese OCR support)

---

## File Map

```
finance-analyzer/
├── backend/
│   ├── main.py                      # FastAPI app entry, CORS, router mounting
│   ├── requirements.txt             # Python dependencies
│   ├── db/
│   │   └── database.py              # SQLAlchemy engine, session, Base, models
│   ├── models/
│   │   └── schemas.py               # Pydantic request/response schemas
│   ├── services/
│   │   ├── credit_parser.py         # PDF text extraction for credit reports
│   │   ├── credit_ocr.py            # Image OCR for scanned credit reports
│   │   ├── bank_parser.py           # Excel/CSV bank statement parsing
│   │   ├── analyzer.py              # Bank statement analysis + dedup + anomaly
│   │   └── exporter.py              # Excel and PDF export
│   ├── routers/
│   │   ├── clients.py               # Client CRUD endpoints
│   │   ├── credit_report.py         # Credit report upload/parse endpoints
│   │   ├── bank_statement.py        # Bank statement upload/parse endpoints
│   │   ├── analysis.py              # Analysis results endpoints
│   │   └── export.py                # Export endpoints
│   └── tests/
│       ├── conftest.py              # Shared fixtures
│       ├── test_bank_parser.py      # Bank parser tests
│       ├── test_analyzer.py         # Analyzer tests
│       ├── test_credit_parser.py    # Credit parser tests
│       ├── test_exporter.py         # Export tests
│       └── test_api.py              # API integration tests
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx                 # React entry
│       ├── App.tsx                  # Router + layout
│       ├── pages/
│       │   ├── UploadCredit.tsx     # Step 1: upload credit report
│       │   ├── UploadBank.tsx       # Step 2: upload bank statement
│       │   └── Report.tsx           # Step 3: view analysis report
│       ├── components/
│       │   ├── StepNav.tsx          # Top step navigation bar
│       │   ├── FileUploader.tsx     # Drag-and-drop file uploader
│       │   ├── CreditSummary.tsx    # Credit report summary cards
│       │   ├── BankSummary.tsx      # Bank statement summary cards
│       │   └── AnomalyTable.tsx     # Anomaly transaction table
│       └── services/
│           └── api.ts               # Axios API client
└── README.md
```

---

### Task 1: Backend Project Scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/db/database.py`
- Create: `backend/models/schemas.py`

- [ ] **Step 1: Create backend directory structure**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
mkdir -p backend/{db,models,services,routers,tests}
touch backend/__init__.py backend/db/__init__.py backend/models/__init__.py backend/services/__init__.py backend/routers/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Write requirements.txt**

Create `backend/requirements.txt`:

```
fastapi==0.115.0
uvicorn==0.30.0
sqlalchemy==2.0.35
pydantic==2.9.0
python-multipart==0.0.9
pdfplumber==0.11.4
pytesseract==0.3.13
Pillow==10.4.0
pdf2image==1.17.0
pandas==2.2.3
openpyxl==3.1.5
reportlab==4.2.5
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 3: Write database models**

Create `backend/db/database.py`:

```python
import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DB_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'finance.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    credit_reports = relationship("CreditReport", back_populates="client", cascade="all, delete-orphan")
    bank_statements = relationship("BankStatement", back_populates="client", cascade="all, delete-orphan")


class CreditReport(Base):
    __tablename__ = "credit_reports"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # "pdf" or "image"
    parsed_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="credit_reports")


class BankStatement(Base):
    __tablename__ = "bank_statements"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    filename = Column(String, nullable=False)
    bank_name = Column(String, nullable=True)
    raw_data = Column(JSON, nullable=True)       # parsed transactions list
    analysis = Column(JSON, nullable=True)        # analysis results
    created_at = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="bank_statements")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 4: Write Pydantic schemas**

Create `backend/models/schemas.py`:

```python
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
```

- [ ] **Step 5: Write FastAPI main entry**

Create `backend/main.py`:

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import init_db

app = FastAPI(title="企业融资数据智能分析工具", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Install dependencies and verify server starts**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
python -c "from main import app; print('App created OK')"
```

- [ ] **Step 7: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/
git commit -m "feat: scaffold backend with FastAPI, SQLAlchemy models, and Pydantic schemas"
```

---

### Task 2: Bank Statement Parser

**Files:**
- Create: `backend/services/bank_parser.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_bank_parser.py`

- [ ] **Step 1: Write test fixtures**

Create `backend/tests/conftest.py`:

```python
import os
import sys
import pytest
import pandas as pd
import tempfile

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


@pytest.fixture
def sample_bank_excel(tmp_path):
    """Create a sample bank statement Excel file."""
    data = {
        "交易日期": ["2026-01-05", "2026-01-10", "2026-01-15", "2026-01-20", "2026-01-25",
                   "2026-02-05", "2026-02-10", "2026-02-15", "2026-02-20", "2026-02-25"],
        "摘要": ["工资", "转账", "消费", "微信提现", "货款",
                "工资", "转账给张三", "消费", "还款", "货款"],
        "交易对手": ["某公司", "张三", "超市", "微信", "客户A",
                   "某公司", "张三", "超市", "银行", "客户B"],
        "收入": [50000, 0, 0, 20000, 30000,
                50000, 0, 0, 0, 35000],
        "支出": [0, 10000, 3000, 0, 0,
                0, 15000, 2500, 5000, 0],
        "余额": [50000, 40000, 37000, 57000, 87000,
                137000, 122000, 119500, 114500, 149500],
    }
    df = pd.DataFrame(data)
    filepath = tmp_path / "bank_statement.xlsx"
    df.to_excel(filepath, index=False)
    return str(filepath)


@pytest.fixture
def sample_bank_csv(tmp_path):
    """Create a sample bank statement CSV file."""
    data = {
        "交易日期": ["2026-01-05", "2026-01-10"],
        "摘要": ["工资", "消费"],
        "交易对手": ["某公司", "超市"],
        "收入": [50000, 0],
        "支出": [0, 3000],
        "余额": [50000, 47000],
    }
    df = pd.DataFrame(data)
    filepath = tmp_path / "bank_statement.csv"
    df.to_csv(filepath, index=False)
    return str(filepath)
```

- [ ] **Step 2: Write failing tests for bank parser**

Create `backend/tests/test_bank_parser.py`:

```python
from services.bank_parser import parse_bank_statement


def test_parse_excel_returns_transactions(sample_bank_excel):
    result = parse_bank_statement(sample_bank_excel)
    assert len(result) == 10
    assert result[0]["date"] == "2026-01-05"
    assert result[0]["income"] == 50000
    assert result[0]["expense"] == 0


def test_parse_excel_has_required_fields(sample_bank_excel):
    result = parse_bank_statement(sample_bank_excel)
    required = {"date", "counterparty", "description", "income", "expense", "balance"}
    for tx in result:
        assert required.issubset(set(tx.keys()))


def test_parse_csv(sample_bank_csv):
    result = parse_bank_statement(sample_bank_csv)
    assert len(result) == 2
    assert result[0]["income"] == 50000


def test_parse_returns_sorted_by_date(sample_bank_excel):
    result = parse_bank_statement(sample_bank_excel)
    dates = [tx["date"] for tx in result]
    assert dates == sorted(dates)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_bank_parser.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'services.bank_parser'`

- [ ] **Step 4: Implement bank parser**

Create `backend/services/bank_parser.py`:

```python
import pandas as pd
from typing import Optional

# Common column name mappings for different bank formats
COLUMN_MAPPINGS = {
    "date": ["交易日期", "日期", "记账日期", "交易时间", "Date"],
    "counterparty": ["交易对手", "对方户名", "对手方", "对方", "收款人/付款人"],
    "description": ["摘要", "备注", "用途", "交易摘要", "附言"],
    "income": ["收入", "贷方金额", "收入金额", "贷方发生额", "存入"],
    "expense": ["支出", "借方金额", "支出金额", "借方发生额", "取出"],
    "balance": ["余额", "账户余额", "Balance"],
}


def _find_column(df_columns: list[str], candidates: list[str]) -> Optional[str]:
    """Find the first matching column name from candidates."""
    for candidate in candidates:
        for col in df_columns:
            if candidate in str(col).strip():
                return col
    return None


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map bank-specific column names to standard names."""
    col_map = {}
    for standard_name, candidates in COLUMN_MAPPINGS.items():
        found = _find_column(list(df.columns), candidates)
        if found:
            col_map[found] = standard_name

    df = df.rename(columns=col_map)

    # Ensure all required columns exist
    for col in ["date", "counterparty", "description", "income", "expense", "balance"]:
        if col not in df.columns:
            df[col] = "" if col in ["counterparty", "description"] else 0.0

    return df


def _clean_amount(value) -> float:
    """Convert amount values to float, handling strings with commas."""
    if pd.isna(value) or value == "" or value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove commas, spaces, currency symbols
    cleaned = str(value).replace(",", "").replace("，", "").replace(" ", "").replace("¥", "").replace("￥", "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_bank_statement(filepath: str) -> list[dict]:
    """Parse a bank statement Excel/CSV file into a list of transaction dicts.

    Returns a list of dicts, each with keys:
      date, counterparty, description, income, expense, balance
    Sorted by date ascending.
    """
    ext = filepath.lower().rsplit(".", 1)[-1]
    if ext == "csv":
        df = pd.read_csv(filepath, dtype=str)
    elif ext in ("xlsx", "xls"):
        df = pd.read_excel(filepath, dtype=str)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    # Drop fully empty rows
    df = df.dropna(how="all").reset_index(drop=True)

    # Normalize columns
    df = _normalize_columns(df)

    # Clean amounts
    for col in ["income", "expense", "balance"]:
        df[col] = df[col].apply(_clean_amount)

    # Clean strings
    for col in ["counterparty", "description"]:
        df[col] = df[col].fillna("").astype(str).str.strip()

    # Clean and sort dates
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    df = df.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)

    return df[["date", "counterparty", "description", "income", "expense", "balance"]].to_dict("records")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_bank_parser.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/services/bank_parser.py backend/tests/
git commit -m "feat: bank statement Excel/CSV parser with column auto-mapping"
```

---

### Task 3: Bank Statement Analyzer (Dedup + Anomaly Detection)

**Files:**
- Create: `backend/services/analyzer.py`
- Create: `backend/tests/test_analyzer.py`

- [ ] **Step 1: Write failing tests for analyzer**

Create `backend/tests/test_analyzer.py`:

```python
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.analyzer import analyze_bank_statement, mark_duplicates, detect_anomalies


def _make_transactions():
    """10 transactions across 2 months for testing."""
    return [
        {"date": "2026-01-05", "counterparty": "某公司", "description": "工资", "income": 50000, "expense": 0, "balance": 50000},
        {"date": "2026-01-10", "counterparty": "张三", "description": "转账", "income": 0, "expense": 10000, "balance": 40000},
        {"date": "2026-01-15", "counterparty": "超市", "description": "消费", "income": 0, "expense": 3000, "balance": 37000},
        {"date": "2026-01-20", "counterparty": "微信", "description": "微信提现", "income": 20000, "expense": 0, "balance": 57000},
        {"date": "2026-01-25", "counterparty": "客户A", "description": "货款", "income": 30000, "expense": 0, "balance": 87000},
        {"date": "2026-02-05", "counterparty": "某公司", "description": "工资", "income": 50000, "expense": 0, "balance": 137000},
        {"date": "2026-02-10", "counterparty": "张三", "description": "转账给张三", "income": 0, "expense": 15000, "balance": 122000},
        {"date": "2026-02-15", "counterparty": "超市", "description": "消费", "income": 0, "expense": 2500, "balance": 119500},
        {"date": "2026-02-20", "counterparty": "银行", "description": "还款", "income": 0, "expense": 5000, "balance": 114500},
        {"date": "2026-02-25", "counterparty": "客户B", "description": "货款", "income": 35000, "expense": 0, "balance": 149500},
    ]


def test_mark_duplicates_wechat():
    txs = _make_transactions()
    result = mark_duplicates(txs, account_holder="张三")
    wechat_tx = result[3]  # "微信提现"
    assert wechat_tx["is_duplicate"] is True
    assert "微信提现" in wechat_tx["duplicate_reason"]


def test_mark_duplicates_self_transfer():
    txs = _make_transactions()
    result = mark_duplicates(txs, account_holder="张三")
    # counterparty "张三" same as holder
    self_transfers = [t for t in result if t["counterparty"] == "张三"]
    assert all(t["is_duplicate"] for t in self_transfers)


def test_analyze_totals():
    txs = _make_transactions()
    result = analyze_bank_statement(txs, account_holder="张三")
    assert result["total_income"] == 185000  # 50k+20k+30k+50k+35k
    assert result["total_expense"] == 35500  # 10k+3k+15k+2.5k+5k


def test_analyze_deduped_totals():
    txs = _make_transactions()
    result = analyze_bank_statement(txs, account_holder="张三")
    # deduped removes: wechat 20k income, self-transfer 10k+15k expense
    assert result["deduped_total_income"] == 165000  # 185000 - 20000
    assert result["deduped_total_expense"] == 10500   # 35500 - 10000 - 15000


def test_analyze_monthly_avg():
    txs = _make_transactions()
    result = analyze_bank_statement(txs, account_holder="张三")
    assert result["monthly_avg_income"] == 92500  # 185000 / 2 months


def test_detect_anomalies_large_amount():
    txs = _make_transactions()
    monthly_avg = 92500
    anomalies = detect_anomalies(txs, monthly_avg_income=monthly_avg)
    # No single tx > 92500*2 = 185000, so no large amount anomalies expected
    large = [a for a in anomalies if a["type"] == "large_amount"]
    assert len(large) == 0


def test_detect_anomalies_large_amount_triggers():
    txs = [
        {"date": "2026-01-05", "counterparty": "X", "description": "大额", "income": 500000, "expense": 0, "balance": 500000},
        {"date": "2026-01-10", "counterparty": "Y", "description": "小额", "income": 1000, "expense": 0, "balance": 501000},
    ]
    anomalies = detect_anomalies(txs, monthly_avg_income=50000)
    large = [a for a in anomalies if a["type"] == "large_amount"]
    assert len(large) == 1
    assert large[0]["amount"] == 500000


def test_analyze_top_income_sources():
    txs = _make_transactions()
    result = analyze_bank_statement(txs, account_holder="张三")
    sources = result["top_income_sources"]
    # Top source should be 某公司 (50k+50k=100k)
    assert sources[0]["counterparty"] == "某公司"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_analyzer.py -v
```

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement analyzer**

Create `backend/services/analyzer.py`:

```python
import re
from collections import defaultdict
from typing import Optional

# Keywords that indicate duplicate/non-business transactions
WECHAT_KEYWORDS = ["微信提现", "财付通提现"]
ALIPAY_KEYWORDS = ["支付宝提现", "支付宝转入"]
DUPLICATE_KEYWORDS = WECHAT_KEYWORDS + ALIPAY_KEYWORDS


def mark_duplicates(transactions: list[dict], account_holder: str = "") -> list[dict]:
    """Mark duplicate transactions (self-transfers, WeChat/Alipay withdrawals).

    Returns a new list with 'is_duplicate' and 'duplicate_reason' fields added.
    """
    result = []
    holder_lower = account_holder.strip().lower() if account_holder else ""

    for tx in transactions:
        tx = dict(tx)  # copy
        tx["is_duplicate"] = False
        tx["duplicate_reason"] = ""

        description = str(tx.get("description", "")).strip()
        counterparty = str(tx.get("counterparty", "")).strip()

        # Rule 1: Self-transfer (counterparty matches account holder)
        if holder_lower and counterparty.lower() == holder_lower:
            tx["is_duplicate"] = True
            tx["duplicate_reason"] = "同名转账"

        # Rule 2: WeChat/Alipay withdrawal keywords in description
        if not tx["is_duplicate"]:
            for kw in DUPLICATE_KEYWORDS:
                if kw in description:
                    tx["is_duplicate"] = True
                    tx["duplicate_reason"] = kw
                    break

        result.append(tx)

    return result


def detect_anomalies(transactions: list[dict], monthly_avg_income: float = 0) -> list[dict]:
    """Detect anomalous transactions.

    Rules:
    1. Large amount: single tx > monthly_avg_income * 2
    2. Round number: large round amounts (>=100000) appearing frequently
    3. Regular pattern: same counterparty + same amount appearing periodically
    """
    anomalies = []
    threshold = monthly_avg_income * 2 if monthly_avg_income > 0 else float("inf")

    # Rule 1: Large amounts
    for tx in transactions:
        amount = max(tx.get("income", 0), tx.get("expense", 0))
        if amount > threshold:
            anomalies.append({
                "date": tx["date"],
                "counterparty": tx.get("counterparty", ""),
                "amount": amount,
                "direction": "收入" if tx.get("income", 0) > tx.get("expense", 0) else "支出",
                "type": "large_amount",
                "description": f"单笔金额{amount:,.0f}元，超过月均收入2倍({threshold:,.0f}元)",
            })

    # Rule 2: Round number transactions (>=100k, divisible by 10000)
    round_txs = []
    for tx in transactions:
        amount = max(tx.get("income", 0), tx.get("expense", 0))
        if amount >= 100000 and amount % 10000 == 0:
            round_txs.append(tx)
    if len(round_txs) >= 3:
        for tx in round_txs:
            amount = max(tx.get("income", 0), tx.get("expense", 0))
            anomalies.append({
                "date": tx["date"],
                "counterparty": tx.get("counterparty", ""),
                "amount": amount,
                "direction": "收入" if tx.get("income", 0) > tx.get("expense", 0) else "支出",
                "type": "round_number",
                "description": f"大额整数交易{amount:,.0f}元，疑似资金调动",
            })

    # Rule 3: Regular pattern (same counterparty + same amount >= 3 times)
    pattern_map = defaultdict(list)
    for tx in transactions:
        amount = max(tx.get("income", 0), tx.get("expense", 0))
        if amount > 0:
            key = (tx.get("counterparty", ""), amount)
            pattern_map[key].append(tx)

    for (cp, amt), txs in pattern_map.items():
        if len(txs) >= 3 and cp:
            for tx in txs:
                anomalies.append({
                    "date": tx["date"],
                    "counterparty": cp,
                    "amount": amt,
                    "direction": "收入" if tx.get("income", 0) > tx.get("expense", 0) else "支出",
                    "type": "regular_pattern",
                    "description": f"与{cp}发生{len(txs)}次相同金额({amt:,.0f}元)交易",
                })

    return anomalies


def analyze_bank_statement(transactions: list[dict], account_holder: str = "") -> dict:
    """Full analysis of bank statement transactions.

    Returns a dict with all analysis results.
    """
    if not transactions:
        return {
            "total_income": 0, "total_expense": 0,
            "monthly_avg_income": 0, "monthly_avg_expense": 0, "monthly_avg_net": 0,
            "deduped_total_income": 0, "deduped_total_expense": 0,
            "deduped_monthly_avg_income": 0, "deduped_monthly_avg_expense": 0,
            "top_income_sources": [], "top_expense_categories": [],
            "monthly_ending_balances": [], "min_balance": 0, "avg_balance": 0,
            "monthly_avg_tx_count": 0, "daily_avg_tx_count": 0,
            "monthly_summary": [], "anomalies": [],
        }

    # Mark duplicates
    marked = mark_duplicates(transactions, account_holder)

    # Calculate month span
    dates = [tx["date"] for tx in marked if tx["date"]]
    months = set()
    for d in dates:
        months.add(d[:7])  # "YYYY-MM"
    num_months = max(len(months), 1)

    # Unique days for daily avg
    unique_days = len(set(dates))
    unique_days = max(unique_days, 1)

    # Raw totals
    total_income = sum(tx.get("income", 0) for tx in marked)
    total_expense = sum(tx.get("expense", 0) for tx in marked)

    # Deduped totals
    deduped_income = sum(tx.get("income", 0) for tx in marked if not tx["is_duplicate"])
    deduped_expense = sum(tx.get("expense", 0) for tx in marked if not tx["is_duplicate"])

    # Monthly averages
    monthly_avg_income = total_income / num_months
    monthly_avg_expense = total_expense / num_months

    # Top income sources (by counterparty)
    income_by_cp = defaultdict(float)
    for tx in marked:
        if tx.get("income", 0) > 0 and tx.get("counterparty"):
            income_by_cp[tx["counterparty"]] += tx["income"]
    top_income = sorted(income_by_cp.items(), key=lambda x: x[1], reverse=True)[:5]
    top_income_sources = [
        {"counterparty": cp, "amount": amt, "ratio": round(amt / total_income * 100, 1) if total_income > 0 else 0}
        for cp, amt in top_income
    ]

    # Top expense categories (by counterparty)
    expense_by_cp = defaultdict(float)
    for tx in marked:
        if tx.get("expense", 0) > 0 and tx.get("counterparty"):
            expense_by_cp[tx["counterparty"]] += tx["expense"]
    top_expense = sorted(expense_by_cp.items(), key=lambda x: x[1], reverse=True)[:5]
    top_expense_categories = [
        {"counterparty": cp, "amount": amt, "ratio": round(amt / total_expense * 100, 1) if total_expense > 0 else 0}
        for cp, amt in top_expense
    ]

    # Monthly ending balances
    monthly_balances = {}
    for tx in marked:
        month = tx["date"][:7]
        monthly_balances[month] = tx.get("balance", 0)  # last tx of month wins (sorted by date)
    monthly_ending_balances = [{"month": m, "balance": b} for m, b in sorted(monthly_balances.items())]

    # Balance stats
    all_balances = [tx.get("balance", 0) for tx in marked]
    min_balance = min(all_balances) if all_balances else 0
    avg_balance = sum(all_balances) / len(all_balances) if all_balances else 0

    # Monthly summary
    monthly_data = defaultdict(lambda: {"income": 0, "expense": 0, "count": 0})
    for tx in marked:
        m = tx["date"][:7]
        monthly_data[m]["income"] += tx.get("income", 0)
        monthly_data[m]["expense"] += tx.get("expense", 0)
        monthly_data[m]["count"] += 1
    monthly_summary = [
        {"month": m, "income": d["income"], "expense": d["expense"],
         "net": d["income"] - d["expense"], "tx_count": d["count"]}
        for m, d in sorted(monthly_data.items())
    ]

    # Anomalies
    anomalies = detect_anomalies(marked, monthly_avg_income)

    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "monthly_avg_income": monthly_avg_income,
        "monthly_avg_expense": monthly_avg_expense,
        "monthly_avg_net": (total_income - total_expense) / num_months,
        "deduped_total_income": deduped_income,
        "deduped_total_expense": deduped_expense,
        "deduped_monthly_avg_income": deduped_income / num_months,
        "deduped_monthly_avg_expense": deduped_expense / num_months,
        "top_income_sources": top_income_sources,
        "top_expense_categories": top_expense_categories,
        "monthly_ending_balances": monthly_ending_balances,
        "min_balance": min_balance,
        "avg_balance": round(avg_balance, 2),
        "monthly_avg_tx_count": len(marked) / num_months,
        "daily_avg_tx_count": round(len(marked) / unique_days, 2),
        "monthly_summary": monthly_summary,
        "anomalies": anomalies,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_analyzer.py -v
```

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/services/analyzer.py backend/tests/test_analyzer.py
git commit -m "feat: bank statement analyzer with dedup and anomaly detection"
```

---

### Task 4: Credit Report PDF Parser

**Files:**
- Create: `backend/services/credit_parser.py`
- Create: `backend/tests/test_credit_parser.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_credit_parser.py`:

```python
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.credit_parser import extract_credit_data, parse_query_records, parse_debt_summary


def test_parse_debt_summary():
    text = """
    信贷交易信息提示
    个人住房贷款 笔数1 余额85万
    信用卡 笔数3 已用额度23.5万 授信总额50万
    其他贷款 笔数2 余额20万
    """
    result = parse_debt_summary(text)
    assert result["total_balance"] > 0


def test_parse_query_records():
    text = """
    查询记录
    2026-03-01 贷款审批 某银行
    2026-02-15 贷款审批 某银行
    2026-01-10 贷款审批 某机构
    2025-12-01 法人资格审查 某银行
    2025-10-01 贷款审批 某银行
    2025-06-01 法人资格审查 某机构
    """
    result = parse_query_records(text, reference_date="2026-03-31")
    assert result["recent_1m"]["loan_approval"] >= 1
    assert result["recent_3m"]["loan_approval"] >= 2
    assert result["recent_6m"]["corporate_review"] >= 1


def test_extract_credit_data_returns_structure():
    text = """
    个人信用报告
    信贷交易信息提示
    住房贷款 余额85万
    信用卡 授信总额50万 已用额度23.5万
    逾期记录: 当前逾期0笔 历史逾期1笔
    查询记录
    2026-03-01 贷款审批 某银行
    """
    result = extract_credit_data(text)
    assert "total_debt" in result
    assert "total_balance" in result
    assert "credit_card_total_limit" in result
    assert "credit_card_used" in result
    assert "credit_card_usage_rate" in result
    assert "query_records" in result
    assert "overdue_records" in result
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_credit_parser.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement credit parser**

Create `backend/services/credit_parser.py`:

```python
import re
import pdfplumber
from datetime import datetime, timedelta
from typing import Optional


def _extract_amount(text: str) -> float:
    """Extract numeric amount from text like '85万', '23.5万', '1000元'."""
    match = re.search(r"([\d,.]+)\s*万", text)
    if match:
        return float(match.group(1).replace(",", "")) * 10000
    match = re.search(r"([\d,.]+)\s*元", text)
    if match:
        return float(match.group(1).replace(",", ""))
    match = re.search(r"([\d,.]+)", text)
    if match:
        return float(match.group(1).replace(",", ""))
    return 0.0


def parse_debt_summary(text: str) -> dict:
    """Parse debt summary section from credit report text."""
    total_balance = 0.0
    total_debt = 0.0
    institution_details = []
    active_loans = []

    # Look for loan types and amounts
    loan_patterns = [
        (r"住房贷款.*?余额\s*([\d,.]+\s*万?)", "住房贷款"),
        (r"个人住房贷款.*?余额\s*([\d,.]+\s*万?)", "住房贷款"),
        (r"商用房贷款.*?余额\s*([\d,.]+\s*万?)", "商用房贷款"),
        (r"其他贷款.*?余额\s*([\d,.]+\s*万?)", "其他贷款"),
        (r"消费贷.*?余额\s*([\d,.]+\s*万?)", "消费贷"),
        (r"经营贷.*?余额\s*([\d,.]+\s*万?)", "经营贷"),
    ]

    for pattern, name in loan_patterns:
        match = re.search(pattern, text)
        if match:
            amount = _extract_amount(match.group(1))
            total_balance += amount
            institution_details.append({"type": name, "balance": amount})
            active_loans.append({"type": name, "balance": amount})

    # Count institutions by type
    inst_count_pattern = r"笔数\s*(\d+)"
    counts = re.findall(inst_count_pattern, text)

    total_debt = total_balance  # debt = outstanding balance

    return {
        "total_debt": total_debt,
        "total_balance": total_balance,
        "institution_details": institution_details,
        "active_loans": active_loans,
    }


def parse_credit_card_info(text: str) -> dict:
    """Parse credit card summary from credit report text."""
    total_limit = 0.0
    used = 0.0

    # Total credit limit
    limit_match = re.search(r"授信总额\s*([\d,.]+\s*万?)", text)
    if limit_match:
        total_limit = _extract_amount(limit_match.group(1))

    # Used amount
    used_match = re.search(r"已用额度\s*([\d,.]+\s*万?)", text)
    if used_match:
        used = _extract_amount(used_match.group(1))

    usage_rate = round(used / total_limit * 100, 1) if total_limit > 0 else 0.0

    return {
        "credit_card_total_limit": total_limit,
        "credit_card_used": used,
        "credit_card_usage_rate": usage_rate,
    }


def parse_overdue_records(text: str) -> list[dict]:
    """Parse overdue/delinquency records."""
    records = []

    # Pattern: 当前逾期X笔
    current_match = re.search(r"当前逾期\s*(\d+)\s*笔", text)
    if current_match and int(current_match.group(1)) > 0:
        records.append({"type": "当前逾期", "count": int(current_match.group(1))})

    # Pattern: 历史逾期X笔
    history_match = re.search(r"历史逾期\s*(\d+)\s*笔", text)
    if history_match and int(history_match.group(1)) > 0:
        records.append({"type": "历史逾期", "count": int(history_match.group(1))})

    # Detailed overdue entries: date + amount patterns
    detail_pattern = r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+逾期.*?([\d,.]+)"
    for match in re.finditer(detail_pattern, text):
        records.append({
            "date": match.group(1),
            "amount": _extract_amount(match.group(2)),
            "type": "逾期明细",
        })

    return records


def parse_query_records(text: str, reference_date: Optional[str] = None) -> dict:
    """Parse query records and count by time period.

    Returns counts for: recent_1m, recent_3m, recent_6m, recent_1y
    Each period has: loan_approval count and corporate_review count.
    """
    if reference_date:
        ref = datetime.strptime(reference_date, "%Y-%m-%d")
    else:
        ref = datetime.now()

    result = {
        "recent_1m": {"loan_approval": 0, "corporate_review": 0},
        "recent_3m": {"loan_approval": 0, "corporate_review": 0},
        "recent_6m": {"loan_approval": 0, "corporate_review": 0},
        "recent_1y": {"loan_approval": 0, "corporate_review": 0},
    }

    # Find query entries: date + type
    query_pattern = r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+(贷款审批|信用卡审批|贷后管理|法人资格审查|法人审查|本人查询)"
    for match in re.finditer(query_pattern, text):
        date_str = match.group(1).replace("/", "-")
        query_type = match.group(2)

        try:
            query_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue

        days_diff = (ref - query_date).days
        if days_diff < 0:
            continue

        is_loan = query_type in ("贷款审批", "信用卡审批", "贷后管理")
        is_corp = query_type in ("法人资格审查", "法人审查")

        if days_diff <= 30:
            if is_loan:
                result["recent_1m"]["loan_approval"] += 1
            if is_corp:
                result["recent_1m"]["corporate_review"] += 1
        if days_diff <= 90:
            if is_loan:
                result["recent_3m"]["loan_approval"] += 1
            if is_corp:
                result["recent_3m"]["corporate_review"] += 1
        if days_diff <= 180:
            if is_loan:
                result["recent_6m"]["loan_approval"] += 1
            if is_corp:
                result["recent_6m"]["corporate_review"] += 1
        if days_diff <= 365:
            if is_loan:
                result["recent_1y"]["loan_approval"] += 1
            if is_corp:
                result["recent_1y"]["corporate_review"] += 1

    return result


def extract_credit_data(text: str, reference_date: Optional[str] = None) -> dict:
    """Extract all structured data from credit report text.

    This is the main entry point. Takes full text of the credit report
    and returns a dict matching CreditReportData schema.
    """
    debt = parse_debt_summary(text)
    card = parse_credit_card_info(text)
    overdue = parse_overdue_records(text)
    queries = parse_query_records(text, reference_date)

    return {
        "total_debt": debt["total_debt"],
        "total_balance": debt["total_balance"],
        "institution_details": debt["institution_details"],
        "credit_card_total_limit": card["credit_card_total_limit"],
        "credit_card_used": card["credit_card_used"],
        "credit_card_usage_rate": card["credit_card_usage_rate"],
        "active_loans": debt["active_loans"],
        "overdue_records": overdue,
        "query_records": queries,
    }


def parse_credit_report_pdf(filepath: str, reference_date: Optional[str] = None) -> dict:
    """Parse a credit report PDF file and return structured data."""
    text = ""
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

    if not text.strip():
        raise ValueError("PDF中未提取到文本内容，可能是扫描件，请使用OCR功能")

    return extract_credit_data(text, reference_date)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_credit_parser.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/services/credit_parser.py backend/tests/test_credit_parser.py
git commit -m "feat: credit report PDF text parser with regex extraction"
```

---

### Task 5: Credit Report OCR (Image Support)

**Files:**
- Create: `backend/services/credit_ocr.py`

- [ ] **Step 1: Implement OCR service**

Create `backend/services/credit_ocr.py`:

```python
import os
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
from typing import Optional
from services.credit_parser import extract_credit_data


def ocr_image(filepath: str) -> str:
    """Run Tesseract OCR on an image file and return extracted text."""
    image = Image.open(filepath)
    text = pytesseract.image_to_string(image, lang="chi_sim+eng")
    return text


def ocr_pdf(filepath: str) -> str:
    """Convert scanned PDF to images and run OCR on each page."""
    images = convert_from_path(filepath, dpi=300)
    full_text = ""
    for i, img in enumerate(images):
        page_text = pytesseract.image_to_string(img, lang="chi_sim+eng")
        full_text += page_text + "\n"
    return full_text


def parse_credit_report_image(filepath: str, reference_date: Optional[str] = None) -> dict:
    """Parse a credit report from an image file (JPG/PNG) using OCR.

    Returns structured data matching CreditReportData schema.
    """
    text = ocr_image(filepath)
    if not text.strip():
        raise ValueError("OCR未能从图片中提取到文本内容")
    return extract_credit_data(text, reference_date)


def parse_credit_report_scanned_pdf(filepath: str, reference_date: Optional[str] = None) -> dict:
    """Parse a scanned credit report PDF using OCR.

    Falls back to this when pdfplumber finds no text.
    Returns structured data matching CreditReportData schema.
    """
    text = ocr_pdf(filepath)
    if not text.strip():
        raise ValueError("OCR未能从PDF扫描件中提取到文本内容")
    return extract_credit_data(text, reference_date)
```

- [ ] **Step 2: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/services/credit_ocr.py
git commit -m "feat: credit report OCR support for images and scanned PDFs"
```

---

### Task 6: Export Service (Excel + PDF)

**Files:**
- Create: `backend/services/exporter.py`
- Create: `backend/tests/test_exporter.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_exporter.py`:

```python
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.exporter import export_excel, export_pdf


def _make_analysis_data():
    return {
        "client": {"name": "张三", "created_at": "2026-03-31"},
        "credit": {
            "total_debt": 1285000,
            "total_balance": 1285000,
            "institution_details": [
                {"type": "住房贷款", "balance": 850000},
                {"type": "消费贷", "balance": 200000},
            ],
            "credit_card_total_limit": 500000,
            "credit_card_used": 235000,
            "credit_card_usage_rate": 47.0,
            "active_loans": [
                {"type": "住房贷款", "balance": 850000},
            ],
            "overdue_records": [
                {"type": "历史逾期", "count": 1},
            ],
            "query_records": {
                "recent_1m": {"loan_approval": 1, "corporate_review": 0},
                "recent_3m": {"loan_approval": 3, "corporate_review": 1},
                "recent_6m": {"loan_approval": 5, "corporate_review": 1},
                "recent_1y": {"loan_approval": 7, "corporate_review": 2},
            },
        },
        "bank": {
            "total_income": 600000,
            "total_expense": 300000,
            "monthly_avg_income": 100000,
            "monthly_avg_expense": 50000,
            "monthly_avg_net": 50000,
            "deduped_total_income": 500000,
            "deduped_total_expense": 250000,
            "deduped_monthly_avg_income": 83333,
            "deduped_monthly_avg_expense": 41667,
            "top_income_sources": [
                {"counterparty": "某公司", "amount": 300000, "ratio": 50.0},
            ],
            "top_expense_categories": [
                {"counterparty": "供应商A", "amount": 100000, "ratio": 33.3},
            ],
            "monthly_ending_balances": [
                {"month": "2026-01", "balance": 200000},
                {"month": "2026-02", "balance": 250000},
            ],
            "min_balance": 50000,
            "avg_balance": 150000,
            "monthly_avg_tx_count": 30,
            "daily_avg_tx_count": 1.5,
            "monthly_summary": [
                {"month": "2026-01", "income": 300000, "expense": 150000, "net": 150000, "tx_count": 30},
                {"month": "2026-02", "income": 300000, "expense": 150000, "net": 150000, "tx_count": 30},
            ],
            "anomalies": [
                {"date": "2026-01-15", "counterparty": "某人", "amount": 500000,
                 "direction": "收入", "type": "large_amount",
                 "description": "单笔金额500,000元，超过月均收入2倍"},
            ],
        },
    }


def test_export_excel(tmp_path):
    data = _make_analysis_data()
    filepath = str(tmp_path / "test_report.xlsx")
    export_excel(data, filepath)
    assert os.path.exists(filepath)
    assert os.path.getsize(filepath) > 0

    import openpyxl
    wb = openpyxl.load_workbook(filepath)
    assert "客户概览" in wb.sheetnames
    assert "征信详情" in wb.sheetnames
    assert "流水汇总" in wb.sheetnames
    assert "异常交易" in wb.sheetnames


def test_export_pdf(tmp_path):
    data = _make_analysis_data()
    filepath = str(tmp_path / "test_report.pdf")
    export_pdf(data, filepath)
    assert os.path.exists(filepath)
    assert os.path.getsize(filepath) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_exporter.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement exporter**

Create `backend/services/exporter.py`:

```python
import os
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Try to register a Chinese font for PDF export
_FONT_REGISTERED = False
_FONT_PATHS = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def _ensure_chinese_font():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return "ChineseFont"
    for fpath in _FONT_PATHS:
        if os.path.exists(fpath):
            try:
                pdfmetrics.registerFont(TTFont("ChineseFont", fpath))
                _FONT_REGISTERED = True
                return "ChineseFont"
            except Exception:
                continue
    # Fallback — PDF will show boxes for Chinese chars but won't crash
    return "Helvetica"


# ─── Excel Export ─────────────────────────────────────────────

HEADER_FILL = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
CELL_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin"),
)


def _write_header_row(ws, row: int, headers: list[str]):
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
        cell.border = CELL_BORDER


def _write_data_row(ws, row: int, values: list):
    for col, v in enumerate(values, 1):
        cell = ws.cell(row=row, column=col, value=v)
        cell.border = CELL_BORDER
        if isinstance(v, (int, float)):
            cell.number_format = "#,##0.00"


def _fmt_money(amount: float) -> str:
    """Format amount for display: e.g. 1285000 -> '128.50万'."""
    if abs(amount) >= 10000:
        return f"{amount / 10000:.2f}万"
    return f"{amount:.2f}元"


def export_excel(data: dict, filepath: str):
    """Export analysis data to a multi-sheet Excel file.

    Sheets: 客户概览, 征信详情, 流水汇总, 异常交易
    """
    wb = Workbook()

    # ── Sheet 1: 客户概览 ──
    ws = wb.active
    ws.title = "客户概览"
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 30
    client = data.get("client", {})
    credit = data.get("credit", {})
    bank = data.get("bank", {})

    overview = [
        ("客户姓名", client.get("name", "")),
        ("报告日期", datetime.now().strftime("%Y-%m-%d")),
        ("", ""),
        ("── 征信概况 ──", ""),
        ("总负债", _fmt_money(credit.get("total_debt", 0))),
        ("信用卡使用率", f"{credit.get('credit_card_usage_rate', 0)}%"),
        ("逾期记录", str(len(credit.get("overdue_records", []))) + "条"),
        ("近3月贷款审批查询", str(credit.get("query_records", {}).get("recent_3m", {}).get("loan_approval", 0)) + "次"),
        ("", ""),
        ("── 流水概况 ──", ""),
        ("月均收入(原始)", _fmt_money(bank.get("monthly_avg_income", 0))),
        ("月均收入(去重)", _fmt_money(bank.get("deduped_monthly_avg_income", 0))),
        ("月均支出(原始)", _fmt_money(bank.get("monthly_avg_expense", 0))),
        ("月均净利润", _fmt_money(bank.get("monthly_avg_net", 0))),
        ("异常交易", str(len(bank.get("anomalies", []))) + "笔"),
    ]
    for i, (label, value) in enumerate(overview, 1):
        ws.cell(row=i, column=1, value=label).font = Font(bold=True) if label else Font()
        ws.cell(row=i, column=2, value=value)

    # ── Sheet 2: 征信详情 ──
    ws2 = wb.create_sheet("征信详情")
    ws2.column_dimensions["A"].width = 20
    ws2.column_dimensions["B"].width = 20
    ws2.column_dimensions["C"].width = 20
    ws2.column_dimensions["D"].width = 20

    row = 1
    ws2.cell(row=row, column=1, value="负债总览").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws2, row, ["项目", "金额"])
    row += 1
    _write_data_row(ws2, row, ["总负债", credit.get("total_debt", 0)])
    row += 1
    _write_data_row(ws2, row, ["总余额", credit.get("total_balance", 0)])
    row += 2

    ws2.cell(row=row, column=1, value="信用卡汇总").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws2, row, ["项目", "金额/比率"])
    row += 1
    _write_data_row(ws2, row, ["总额度", credit.get("credit_card_total_limit", 0)])
    row += 1
    _write_data_row(ws2, row, ["已用额度", credit.get("credit_card_used", 0)])
    row += 1
    _write_data_row(ws2, row, ["使用率", f"{credit.get('credit_card_usage_rate', 0)}%"])
    row += 2

    ws2.cell(row=row, column=1, value="在贷机构").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws2, row, ["贷款类型", "余额"])
    row += 1
    for loan in credit.get("active_loans", []):
        _write_data_row(ws2, row, [loan.get("type", ""), loan.get("balance", 0)])
        row += 1
    row += 1

    ws2.cell(row=row, column=1, value="逾期记录").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws2, row, ["类型", "次数/金额", "日期"])
    row += 1
    for rec in credit.get("overdue_records", []):
        _write_data_row(ws2, row, [
            rec.get("type", ""),
            rec.get("count", rec.get("amount", "")),
            rec.get("date", ""),
        ])
        row += 1
    row += 1

    ws2.cell(row=row, column=1, value="查询记录").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws2, row, ["时间段", "贷款审批", "法人审查"])
    row += 1
    qr = credit.get("query_records", {})
    for period, label in [("recent_1m", "近1个月"), ("recent_3m", "近3个月"), ("recent_6m", "近半年"), ("recent_1y", "近1年")]:
        p = qr.get(period, {})
        _write_data_row(ws2, row, [label, p.get("loan_approval", 0), p.get("corporate_review", 0)])
        row += 1

    # ── Sheet 3: 流水汇总 ──
    ws3 = wb.create_sheet("流水汇总")
    ws3.column_dimensions["A"].width = 15
    ws3.column_dimensions["B"].width = 18
    ws3.column_dimensions["C"].width = 18
    ws3.column_dimensions["D"].width = 18
    ws3.column_dimensions["E"].width = 18

    row = 1
    ws3.cell(row=row, column=1, value="收支汇总").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws3, row, ["项目", "原始", "去重后"])
    row += 1
    _write_data_row(ws3, row, ["总收入", bank.get("total_income", 0), bank.get("deduped_total_income", 0)])
    row += 1
    _write_data_row(ws3, row, ["总支出", bank.get("total_expense", 0), bank.get("deduped_total_expense", 0)])
    row += 1
    _write_data_row(ws3, row, ["月均收入", bank.get("monthly_avg_income", 0), bank.get("deduped_monthly_avg_income", 0)])
    row += 1
    _write_data_row(ws3, row, ["月均支出", bank.get("monthly_avg_expense", 0), bank.get("deduped_monthly_avg_expense", 0)])
    row += 2

    ws3.cell(row=row, column=1, value="月度明细").font = Font(bold=True, size=12)
    row += 1
    _write_header_row(ws3, row, ["月份", "收入", "支出", "净收入", "交易笔数"])
    row += 1
    for ms in bank.get("monthly_summary", []):
        _write_data_row(ws3, row, [
            ms.get("month", ""), ms.get("income", 0), ms.get("expense", 0),
            ms.get("net", 0), ms.get("tx_count", 0),
        ])
        row += 1

    # ── Sheet 4: 异常交易 ──
    ws4 = wb.create_sheet("异常交易")
    ws4.column_dimensions["A"].width = 15
    ws4.column_dimensions["B"].width = 15
    ws4.column_dimensions["C"].width = 18
    ws4.column_dimensions["D"].width = 10
    ws4.column_dimensions["E"].width = 15
    ws4.column_dimensions["F"].width = 40

    row = 1
    _write_header_row(ws4, row, ["日期", "交易对手", "金额", "方向", "异常类型", "说明"])
    row += 1
    type_labels = {"large_amount": "大额交易", "round_number": "整数交易", "regular_pattern": "规律交易"}
    for a in bank.get("anomalies", []):
        _write_data_row(ws4, row, [
            a.get("date", ""), a.get("counterparty", ""), a.get("amount", 0),
            a.get("direction", ""), type_labels.get(a.get("type", ""), a.get("type", "")),
            a.get("description", ""),
        ])
        row += 1

    wb.save(filepath)


# ─── PDF Export ───────────────────────────────────────────────

def export_pdf(data: dict, filepath: str):
    """Export analysis data to a PDF report.

    Sections: cover, credit summary, bank analysis, anomalies, overall assessment.
    """
    font_name = _ensure_chinese_font()
    doc = SimpleDocTemplate(filepath, pagesize=A4,
                           leftMargin=20*mm, rightMargin=20*mm,
                           topMargin=20*mm, bottomMargin=20*mm)

    styles = getSampleStyleSheet()
    # Create Chinese-compatible styles
    title_style = ParagraphStyle("CNTitle", parent=styles["Title"], fontName=font_name, fontSize=18)
    heading_style = ParagraphStyle("CNHeading", parent=styles["Heading2"], fontName=font_name, fontSize=14)
    body_style = ParagraphStyle("CNBody", parent=styles["Normal"], fontName=font_name, fontSize=10, leading=14)

    elements = []
    client = data.get("client", {})
    credit = data.get("credit", {})
    bank = data.get("bank", {})

    # ── Cover ──
    elements.append(Spacer(1, 60*mm))
    elements.append(Paragraph("企业融资分析报告", title_style))
    elements.append(Spacer(1, 10*mm))
    elements.append(Paragraph(f"客户：{client.get('name', '')}", body_style))
    elements.append(Paragraph(f"报告日期：{datetime.now().strftime('%Y-%m-%d')}", body_style))
    elements.append(Spacer(1, 40*mm))

    # ── Credit Summary ──
    elements.append(Paragraph("一、征信概况", heading_style))
    elements.append(Spacer(1, 3*mm))

    credit_data = [
        ["项目", "数值"],
        ["总负债", _fmt_money(credit.get("total_debt", 0))],
        ["总余额", _fmt_money(credit.get("total_balance", 0))],
        ["信用卡总额度", _fmt_money(credit.get("credit_card_total_limit", 0))],
        ["信用卡已用额度", _fmt_money(credit.get("credit_card_used", 0))],
        ["信用卡使用率", f"{credit.get('credit_card_usage_rate', 0)}%"],
    ]
    t = Table(credit_data, colWidths=[80*mm, 80*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 5*mm))

    # Query records table
    elements.append(Paragraph("查询记录", body_style))
    qr = credit.get("query_records", {})
    query_data = [["时间段", "贷款审批", "法人审查"]]
    for period, label in [("recent_1m", "近1月"), ("recent_3m", "近3月"), ("recent_6m", "近半年"), ("recent_1y", "近1年")]:
        p = qr.get(period, {})
        query_data.append([label, str(p.get("loan_approval", 0)), str(p.get("corporate_review", 0))])
    t2 = Table(query_data, colWidths=[50*mm, 55*mm, 55*mm])
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]))
    elements.append(t2)
    elements.append(Spacer(1, 8*mm))

    # ── Bank Analysis ──
    elements.append(Paragraph("二、银行流水分析", heading_style))
    elements.append(Spacer(1, 3*mm))

    bank_data = [
        ["项目", "原始", "去重后"],
        ["总收入", _fmt_money(bank.get("total_income", 0)), _fmt_money(bank.get("deduped_total_income", 0))],
        ["总支出", _fmt_money(bank.get("total_expense", 0)), _fmt_money(bank.get("deduped_total_expense", 0))],
        ["月均收入", _fmt_money(bank.get("monthly_avg_income", 0)), _fmt_money(bank.get("deduped_monthly_avg_income", 0))],
        ["月均支出", _fmt_money(bank.get("monthly_avg_expense", 0)), _fmt_money(bank.get("deduped_monthly_avg_expense", 0))],
        ["月均净利润", _fmt_money(bank.get("monthly_avg_net", 0)), ""],
    ]
    t3 = Table(bank_data, colWidths=[50*mm, 55*mm, 55*mm])
    t3.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]))
    elements.append(t3)
    elements.append(Spacer(1, 8*mm))

    # ── Anomalies ──
    anomalies = bank.get("anomalies", [])
    elements.append(Paragraph("三、异常交易", heading_style))
    elements.append(Spacer(1, 3*mm))
    if anomalies:
        type_labels = {"large_amount": "大额交易", "round_number": "整数交易", "regular_pattern": "规律交易"}
        anom_data = [["日期", "对手方", "金额", "类型"]]
        for a in anomalies[:20]:  # limit to 20 rows
            anom_data.append([
                a.get("date", ""),
                a.get("counterparty", ""),
                _fmt_money(a.get("amount", 0)),
                type_labels.get(a.get("type", ""), a.get("type", "")),
            ])
        t4 = Table(anom_data, colWidths=[35*mm, 45*mm, 40*mm, 40*mm])
        t4.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#C0392B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, -1), font_name),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(t4)
    else:
        elements.append(Paragraph("未发现异常交易", body_style))

    doc.build(elements)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/test_exporter.py -v
```

Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/services/exporter.py backend/tests/test_exporter.py
git commit -m "feat: Excel and PDF export with multi-sheet structure and Chinese font support"
```

---

### Task 7: Backend API Routes

**Files:**
- Create: `backend/routers/clients.py`
- Create: `backend/routers/credit_report.py`
- Create: `backend/routers/bank_statement.py`
- Create: `backend/routers/analysis.py`
- Create: `backend/routers/export.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Create client routes**

Create `backend/routers/clients.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db, Client
from models.schemas import ClientCreate, ClientResponse

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.post("/", response_model=ClientResponse)
def create_client(client: ClientCreate, db: Session = Depends(get_db)):
    db_client = Client(name=client.name)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client


@router.get("/", response_model=list[ClientResponse])
def list_clients(db: Session = Depends(get_db)):
    return db.query(Client).order_by(Client.created_at.desc()).all()


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客户不存在")
    return client
```

- [ ] **Step 2: Create credit report routes**

Create `backend/routers/credit_report.py`:

```python
import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from db.database import get_db, CreditReport, Client
from models.schemas import CreditReportResponse
from services.credit_parser import parse_credit_report_pdf, extract_credit_data
from services.credit_ocr import parse_credit_report_image, parse_credit_report_scanned_pdf

router = APIRouter(prefix="/api/credit-report", tags=["credit-report"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "credit")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _save_upload(file: UploadFile) -> str:
    """Save uploaded file and return the path."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return filepath


def _detect_file_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext == "pdf":
        return "pdf"
    if ext in ("jpg", "jpeg", "png", "bmp", "tiff"):
        return "image"
    raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}，请上传PDF或图片文件")


@router.post("/upload", response_model=CreditReportResponse)
def upload_credit_report(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    db: Session = Depends(get_db),
):
    # Verify client exists
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客户不存在")

    file_type = _detect_file_type(file.filename)
    filepath = _save_upload(file)
    reference_date = datetime.now().strftime("%Y-%m-%d")

    try:
        if file_type == "pdf":
            try:
                parsed = parse_credit_report_pdf(filepath, reference_date)
            except ValueError:
                # PDF has no text — try OCR
                parsed = parse_credit_report_scanned_pdf(filepath, reference_date)
        else:
            parsed = parse_credit_report_image(filepath, reference_date)
    except Exception as e:
        # Save record even if parsing fails, with empty data
        parsed = None

    record = CreditReport(
        client_id=client_id,
        filename=file.filename,
        file_type=file_type,
        parsed_data=parsed,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
```

- [ ] **Step 3: Create bank statement routes**

Create `backend/routers/bank_statement.py`:

```python
import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from db.database import get_db, BankStatement, Client
from models.schemas import BankStatementResponse
from services.bank_parser import parse_bank_statement
from services.analyzer import analyze_bank_statement

router = APIRouter(prefix="/api/bank-statement", tags=["bank-statement"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "bank")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _save_upload(file: UploadFile) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return filepath


@router.post("/upload", response_model=BankStatementResponse)
def upload_bank_statement(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    account_holder: str = Form(""),
    bank_name: str = Form(""),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客户不存在")

    ext = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if ext not in ("xlsx", "xls", "csv"):
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}，请上传Excel或CSV文件")

    filepath = _save_upload(file)

    try:
        transactions = parse_bank_statement(filepath)
        holder = account_holder if account_holder else client.name
        analysis = analyze_bank_statement(transactions, account_holder=holder)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"流水解析失败: {str(e)}")

    record = BankStatement(
        client_id=client_id,
        filename=file.filename,
        bank_name=bank_name or None,
        raw_data=transactions,
        analysis=analysis,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
```

- [ ] **Step 4: Create analysis routes**

Create `backend/routers/analysis.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db, Client, CreditReport, BankStatement
from models.schemas import FullAnalysisResponse, ClientResponse, CreditReportResponse, BankStatementResponse

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/{client_id}", response_model=FullAnalysisResponse)
def get_analysis(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客户不存在")

    credit_reports = db.query(CreditReport).filter(CreditReport.client_id == client_id).all()
    bank_statements = db.query(BankStatement).filter(BankStatement.client_id == client_id).all()

    return {
        "client": client,
        "credit_reports": credit_reports,
        "bank_statements": bank_statements,
    }
```

- [ ] **Step 5: Create export routes**

Create `backend/routers/export.py`:

```python
import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from db.database import get_db, Client, CreditReport, BankStatement
from services.exporter import export_excel, export_pdf

router = APIRouter(prefix="/api/export", tags=["export"])


def _build_export_data(client_id: int, db: Session) -> dict:
    """Gather all data for a client into the export format."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="客户不存在")

    credit_reports = db.query(CreditReport).filter(CreditReport.client_id == client_id).all()
    bank_statements = db.query(BankStatement).filter(BankStatement.client_id == client_id).all()

    # Merge credit data (use first report with data)
    credit_data = {}
    for cr in credit_reports:
        if cr.parsed_data:
            credit_data = cr.parsed_data
            break

    # Merge bank analysis (use first statement with analysis)
    bank_data = {}
    for bs in bank_statements:
        if bs.analysis:
            bank_data = bs.analysis
            break

    return {
        "client": {"name": client.name, "created_at": str(client.created_at)},
        "credit": credit_data,
        "bank": bank_data,
    }


@router.get("/{client_id}/excel")
def export_client_excel(client_id: int, db: Session = Depends(get_db)):
    data = _build_export_data(client_id, db)
    client_name = data["client"]["name"]

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False, prefix=f"{client_name}_分析报告_")
    filepath = tmp.name
    tmp.close()

    export_excel(data, filepath)
    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"{client_name}_融资分析报告.xlsx",
    )


@router.get("/{client_id}/pdf")
def export_client_pdf(client_id: int, db: Session = Depends(get_db)):
    data = _build_export_data(client_id, db)
    client_name = data["client"]["name"]

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False, prefix=f"{client_name}_分析报告_")
    filepath = tmp.name
    tmp.close()

    export_pdf(data, filepath)
    return FileResponse(
        filepath,
        media_type="application/pdf",
        filename=f"{client_name}_融资分析报告.pdf",
    )
```

- [ ] **Step 6: Update main.py to mount all routers**

Replace `backend/main.py` with:

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import init_db
from routers import clients, credit_report, bank_statement, analysis, export

app = FastAPI(title="企业融资数据智能分析工具", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.include_router(clients.router)
app.include_router(credit_report.router)
app.include_router(bank_statement.router)
app.include_router(analysis.router)
app.include_router(export.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Write API integration test**

Create `backend/tests/test_api.py`:

```python
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi.testclient import TestClient
from main import app
from db.database import Base, engine

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_create_and_list_clients():
    r = client.post("/api/clients/", json={"name": "张三"})
    assert r.status_code == 200
    assert r.json()["name"] == "张三"
    client_id = r.json()["id"]

    r = client.get("/api/clients/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_upload_bank_statement(sample_bank_excel):
    # Create client first
    r = client.post("/api/clients/", json={"name": "张三"})
    client_id = r.json()["id"]

    with open(sample_bank_excel, "rb") as f:
        r = client.post(
            "/api/bank-statement/upload",
            files={"file": ("test.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": str(client_id), "account_holder": "张三"},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["analysis"] is not None
    assert data["analysis"]["total_income"] > 0


def test_get_analysis(sample_bank_excel):
    # Create client
    r = client.post("/api/clients/", json={"name": "张三"})
    client_id = r.json()["id"]

    # Upload bank statement
    with open(sample_bank_excel, "rb") as f:
        client.post(
            "/api/bank-statement/upload",
            files={"file": ("test.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": str(client_id), "account_holder": "张三"},
        )

    # Get analysis
    r = client.get(f"/api/analysis/{client_id}")
    assert r.status_code == 200
    assert r.json()["client"]["name"] == "张三"
    assert len(r.json()["bank_statements"]) == 1
```

Note: `test_api.py` reuses the `sample_bank_excel` fixture from `conftest.py`.

- [ ] **Step 8: Run all backend tests**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 9: Verify server starts and responds**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
timeout 5 uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 2
curl http://localhost:8000/api/health
kill %1 2>/dev/null
```

Expected: `{"status":"ok"}`

- [ ] **Step 10: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add backend/routers/ backend/main.py backend/tests/test_api.py
git commit -m "feat: complete backend API routes for clients, credit reports, bank statements, analysis, and export"
```

---

### Task 8: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/services/api.ts`

- [ ] **Step 1: Initialize React project with Vite**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install antd @ant-design/icons @ant-design/charts axios
```

- [ ] **Step 2: Configure Vite proxy**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 3: Write API service**

Create `frontend/src/services/api.ts`:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60s for large file uploads
});

// ── Client APIs ──

export interface Client {
  id: number;
  name: string;
  created_at: string;
}

export const createClient = (name: string) =>
  api.post<Client>('/clients/', { name });

export const listClients = () =>
  api.get<Client[]>('/clients/');

// ── Credit Report APIs ──

export interface CreditReportData {
  total_debt: number;
  total_balance: number;
  institution_details: Array<{ type: string; balance: number }>;
  credit_card_total_limit: number;
  credit_card_used: number;
  credit_card_usage_rate: number;
  active_loans: Array<{ type: string; balance: number }>;
  overdue_records: Array<{ type: string; count?: number; amount?: number; date?: string }>;
  query_records: {
    recent_1m: { loan_approval: number; corporate_review: number };
    recent_3m: { loan_approval: number; corporate_review: number };
    recent_6m: { loan_approval: number; corporate_review: number };
    recent_1y: { loan_approval: number; corporate_review: number };
  };
}

export interface CreditReport {
  id: number;
  client_id: number;
  filename: string;
  file_type: string;
  parsed_data: CreditReportData | null;
  created_at: string;
}

export const uploadCreditReport = (file: File, clientId: number) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('client_id', String(clientId));
  return api.post<CreditReport>('/credit-report/upload', formData);
};

// ── Bank Statement APIs ──

export interface BankAnalysis {
  total_income: number;
  total_expense: number;
  monthly_avg_income: number;
  monthly_avg_expense: number;
  monthly_avg_net: number;
  deduped_total_income: number;
  deduped_total_expense: number;
  deduped_monthly_avg_income: number;
  deduped_monthly_avg_expense: number;
  top_income_sources: Array<{ counterparty: string; amount: number; ratio: number }>;
  top_expense_categories: Array<{ counterparty: string; amount: number; ratio: number }>;
  monthly_ending_balances: Array<{ month: string; balance: number }>;
  min_balance: number;
  avg_balance: number;
  monthly_avg_tx_count: number;
  daily_avg_tx_count: number;
  monthly_summary: Array<{
    month: string; income: number; expense: number; net: number; tx_count: number;
  }>;
  anomalies: Array<{
    date: string; counterparty: string; amount: number;
    direction: string; type: string; description: string;
  }>;
}

export interface BankStatement {
  id: number;
  client_id: number;
  filename: string;
  bank_name: string | null;
  analysis: BankAnalysis | null;
  created_at: string;
}

export const uploadBankStatement = (file: File, clientId: number, accountHolder: string, bankName: string = '') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('client_id', String(clientId));
  formData.append('account_holder', accountHolder);
  formData.append('bank_name', bankName);
  return api.post<BankStatement>('/bank-statement/upload', formData);
};

// ── Analysis APIs ──

export interface FullAnalysis {
  client: Client;
  credit_reports: CreditReport[];
  bank_statements: BankStatement[];
}

export const getAnalysis = (clientId: number) =>
  api.get<FullAnalysis>(`/analysis/${clientId}`);

// ── Export APIs ──

export const exportExcel = (clientId: number) =>
  api.get(`/export/${clientId}/excel`, { responseType: 'blob' });

export const exportPdf = (clientId: number) =>
  api.get(`/export/${clientId}/pdf`, { responseType: 'blob' });

export default api;
```

- [ ] **Step 4: Write App.tsx with router shell**

Replace `frontend/src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import StepNav from './components/StepNav';
import UploadCredit from './pages/UploadCredit';
import UploadBank from './pages/UploadBank';
import Report from './pages/Report';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');

  const handleCreditDone = (id: number, name: string) => {
    setClientId(id);
    setClientName(name);
    setCurrentStep(1);
  };

  const handleBankDone = () => {
    setCurrentStep(2);
  };

  const handleBack = (step: number) => {
    setCurrentStep(step);
  };

  return (
    <ConfigProvider locale={zhCN}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 32, color: '#1677ff' }}>
          企业融资数据智能分析
        </h1>
        <StepNav current={currentStep} />
        <div style={{ marginTop: 32 }}>
          {currentStep === 0 && (
            <UploadCredit onDone={handleCreditDone} />
          )}
          {currentStep === 1 && clientId && (
            <UploadBank
              clientId={clientId}
              clientName={clientName}
              onDone={handleBankDone}
              onBack={() => handleBack(0)}
            />
          )}
          {currentStep === 2 && clientId && (
            <Report
              clientId={clientId}
              onBack={() => handleBack(1)}
            />
          )}
        </div>
      </div>
    </ConfigProvider>
  );
};

export default App;
```

- [ ] **Step 5: Replace main.tsx**

Replace `frontend/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add frontend/
git commit -m "feat: scaffold frontend with React, Vite, Ant Design, and API service"
```

---

### Task 9: Frontend Components

**Files:**
- Create: `frontend/src/components/StepNav.tsx`
- Create: `frontend/src/components/FileUploader.tsx`
- Create: `frontend/src/components/CreditSummary.tsx`
- Create: `frontend/src/components/BankSummary.tsx`
- Create: `frontend/src/components/AnomalyTable.tsx`

- [ ] **Step 1: Create StepNav component**

Create `frontend/src/components/StepNav.tsx`:

```tsx
import React from 'react';
import { Steps } from 'antd';
import { FileTextOutlined, BankOutlined, BarChartOutlined } from '@ant-design/icons';

interface StepNavProps {
  current: number;
}

const StepNav: React.FC<StepNavProps> = ({ current }) => {
  return (
    <Steps
      current={current}
      items={[
        { title: '上传征信报告', icon: <FileTextOutlined /> },
        { title: '上传银行流水', icon: <BankOutlined /> },
        { title: '查看分析报告', icon: <BarChartOutlined /> },
      ]}
    />
  );
};

export default StepNav;
```

- [ ] **Step 2: Create FileUploader component**

Create `frontend/src/components/FileUploader.tsx`:

```tsx
import React from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';

const { Dragger } = Upload;

interface FileUploaderProps {
  accept: string;
  hint: string;
  onFileSelected: (file: File) => void;
  fileList: UploadFile[];
  loading?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  accept,
  hint,
  onFileSelected,
  fileList,
  loading = false,
}) => {
  return (
    <Dragger
      accept={accept}
      fileList={fileList}
      beforeUpload={(file) => {
        onFileSelected(file);
        return false; // prevent auto upload
      }}
      showUploadList={{ showRemoveIcon: true }}
      disabled={loading}
      maxCount={1}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽文件到此处</p>
      <p className="ant-upload-hint">{hint}</p>
    </Dragger>
  );
};

export default FileUploader;
```

- [ ] **Step 3: Create CreditSummary component**

Create `frontend/src/components/CreditSummary.tsx`:

```tsx
import React from 'react';
import { Card, Statistic, Row, Col, Table, Descriptions } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { CreditReportData } from '../services/api';

interface CreditSummaryProps {
  data: CreditReportData;
}

const fmtMoney = (v: number) => {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toFixed(2)}元`;
};

const CreditSummary: React.FC<CreditSummaryProps> = ({ data }) => {
  const qr = data.query_records;

  const queryColumns = [
    { title: '时间段', dataIndex: 'period', key: 'period' },
    { title: '贷款审批', dataIndex: 'loan', key: 'loan' },
    { title: '法人审查', dataIndex: 'corp', key: 'corp' },
  ];

  const queryData = [
    { key: '1m', period: '近1个月', loan: qr.recent_1m.loan_approval, corp: qr.recent_1m.corporate_review },
    { key: '3m', period: '近3个月', loan: qr.recent_3m.loan_approval, corp: qr.recent_3m.corporate_review },
    { key: '6m', period: '近半年', loan: qr.recent_6m.loan_approval, corp: qr.recent_6m.corporate_review },
    { key: '1y', period: '近1年', loan: qr.recent_1y.loan_approval, corp: qr.recent_1y.corporate_review },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总负债" value={data.total_debt} formatter={(v) => fmtMoney(Number(v))} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="信用卡使用率" value={data.credit_card_usage_rate} suffix="%" precision={1}
              valueStyle={{ color: data.credit_card_usage_rate > 70 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="逾期记录" value={data.overdue_records.length} suffix="条"
              prefix={data.overdue_records.length > 0 ? <WarningOutlined /> : undefined}
              valueStyle={{ color: data.overdue_records.length > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="近3月查询" value={qr.recent_3m.loan_approval} suffix="次" />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="在贷机构" size="small">
            <Descriptions column={1} size="small">
              {data.active_loans.map((loan, i) => (
                <Descriptions.Item key={i} label={loan.type}>
                  {fmtMoney(loan.balance)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="查询记录" size="small">
            <Table columns={queryColumns} dataSource={queryData} pagination={false} size="small" />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CreditSummary;
```

- [ ] **Step 4: Create BankSummary component**

Create `frontend/src/components/BankSummary.tsx`:

```tsx
import React from 'react';
import { Card, Statistic, Row, Col, Table, Descriptions } from 'antd';
import type { BankAnalysis } from '../services/api';

interface BankSummaryProps {
  data: BankAnalysis;
}

const fmtMoney = (v: number) => {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toFixed(2)}元`;
};

const BankSummary: React.FC<BankSummaryProps> = ({ data }) => {
  const monthlyColumns = [
    { title: '月份', dataIndex: 'month', key: 'month' },
    { title: '收入', dataIndex: 'income', key: 'income', render: (v: number) => fmtMoney(v) },
    { title: '支出', dataIndex: 'expense', key: 'expense', render: (v: number) => fmtMoney(v) },
    { title: '净收入', dataIndex: 'net', key: 'net', render: (v: number) => (
      <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>{fmtMoney(v)}</span>
    )},
    { title: '交易笔数', dataIndex: 'tx_count', key: 'tx_count' },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="月均收入(原始)" value={data.monthly_avg_income} formatter={(v) => fmtMoney(Number(v))} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="月均收入(去重)" value={data.deduped_monthly_avg_income}
              formatter={(v) => fmtMoney(Number(v))} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="月均支出" value={data.monthly_avg_expense} formatter={(v) => fmtMoney(Number(v))} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="月均净利润" value={data.monthly_avg_net}
              formatter={(v) => fmtMoney(Number(v))}
              valueStyle={{ color: data.monthly_avg_net >= 0 ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="收支对比" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="总收入(原始)">{fmtMoney(data.total_income)}</Descriptions.Item>
              <Descriptions.Item label="总收入(去重)">{fmtMoney(data.deduped_total_income)}</Descriptions.Item>
              <Descriptions.Item label="总支出(原始)">{fmtMoney(data.total_expense)}</Descriptions.Item>
              <Descriptions.Item label="总支出(去重)">{fmtMoney(data.deduped_total_expense)}</Descriptions.Item>
              <Descriptions.Item label="最低余额">{fmtMoney(data.min_balance)}</Descriptions.Item>
              <Descriptions.Item label="平均余额">{fmtMoney(data.avg_balance)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="主要收入来源" size="small">
            {data.top_income_sources.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                borderBottom: i < data.top_income_sources.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <span>{s.counterparty}</span>
                <span>{fmtMoney(s.amount)} ({s.ratio}%)</span>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Card title="月度明细" size="small">
        <Table
          columns={monthlyColumns}
          dataSource={data.monthly_summary.map((m, i) => ({ ...m, key: i }))}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
};

export default BankSummary;
```

- [ ] **Step 5: Create AnomalyTable component**

Create `frontend/src/components/AnomalyTable.tsx`:

```tsx
import React from 'react';
import { Table, Tag } from 'antd';

interface Anomaly {
  date: string;
  counterparty: string;
  amount: number;
  direction: string;
  type: string;
  description: string;
}

interface AnomalyTableProps {
  data: Anomaly[];
}

const typeColors: Record<string, string> = {
  large_amount: 'red',
  round_number: 'orange',
  regular_pattern: 'blue',
};

const typeLabels: Record<string, string> = {
  large_amount: '大额交易',
  round_number: '整数交易',
  regular_pattern: '规律交易',
};

const fmtMoney = (v: number) => {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toFixed(2)}元`;
};

const AnomalyTable: React.FC<AnomalyTableProps> = ({ data }) => {
  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '交易对手', dataIndex: 'counterparty', key: 'counterparty', width: 120 },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120,
      render: (v: number) => fmtMoney(v) },
    { title: '方向', dataIndex: 'direction', key: 'direction', width: 60,
      render: (v: string) => <Tag color={v === '收入' ? 'green' : 'red'}>{v}</Tag> },
    { title: '异常类型', dataIndex: 'type', key: 'type', width: 100,
      render: (v: string) => <Tag color={typeColors[v] || 'default'}>{typeLabels[v] || v}</Tag> },
    { title: '说明', dataIndex: 'description', key: 'description' },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data.map((d, i) => ({ ...d, key: i }))}
      pagination={{ pageSize: 10 }}
      size="small"
    />
  );
};

export default AnomalyTable;
```

- [ ] **Step 6: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add frontend/src/components/
git commit -m "feat: frontend components - StepNav, FileUploader, CreditSummary, BankSummary, AnomalyTable"
```

---

### Task 10: Frontend Pages

**Files:**
- Create: `frontend/src/pages/UploadCredit.tsx`
- Create: `frontend/src/pages/UploadBank.tsx`
- Create: `frontend/src/pages/Report.tsx`

- [ ] **Step 1: Create UploadCredit page**

Create `frontend/src/pages/UploadCredit.tsx`:

```tsx
import React, { useState } from 'react';
import { Card, Input, Button, Space, message, Spin } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import FileUploader from '../components/FileUploader';
import CreditSummary from '../components/CreditSummary';
import { createClient, uploadCreditReport, CreditReportData } from '../services/api';

interface UploadCreditProps {
  onDone: (clientId: number, clientName: string) => void;
}

const UploadCredit: React.FC<UploadCreditProps> = ({ onDone }) => {
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<CreditReportData | null>(null);

  const handleFileSelected = async (file: File) => {
    if (!clientName.trim()) {
      message.error('请先输入客户姓名');
      return;
    }

    setLoading(true);
    setFileList([{ uid: '-1', name: file.name, status: 'uploading' }]);

    try {
      // Create client if not yet created
      let cid = clientId;
      if (!cid) {
        const res = await createClient(clientName.trim());
        cid = res.data.id;
        setClientId(cid);
      }

      const res = await uploadCreditReport(file, cid);
      setParsedData(res.data.parsed_data);
      setFileList([{ uid: '-1', name: file.name, status: 'done' }]);
      message.success('征信报告解析完成');
    } catch (err: any) {
      setFileList([{ uid: '-1', name: file.name, status: 'error' }]);
      message.error('解析失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Card title="客户信息" style={{ marginBottom: 16 }}>
        <Input
          placeholder="请输入客户姓名"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          style={{ width: 300 }}
          disabled={!!clientId}
        />
      </Card>

      <Card title="上传征信报告" style={{ marginBottom: 16 }}>
        <Spin spinning={loading} tip="正在解析征信报告...">
          <FileUploader
            accept=".pdf,.jpg,.jpeg,.png"
            hint="支持 PDF 文件或图片（JPG/PNG）"
            onFileSelected={handleFileSelected}
            fileList={fileList}
            loading={loading}
          />
        </Spin>
      </Card>

      {parsedData && (
        <Card title="解析结果预览" style={{ marginBottom: 16 }}>
          <CreditSummary data={parsedData} />
        </Card>
      )}

      <div style={{ textAlign: 'right' }}>
        <Button
          type="primary"
          size="large"
          disabled={!clientId}
          onClick={() => onDone(clientId!, clientName)}
        >
          下一步：上传银行流水 →
        </Button>
      </div>
    </div>
  );
};

export default UploadCredit;
```

- [ ] **Step 2: Create UploadBank page**

Create `frontend/src/pages/UploadBank.tsx`:

```tsx
import React, { useState } from 'react';
import { Card, Button, Input, Space, message, Spin, List } from 'antd';
import { DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import FileUploader from '../components/FileUploader';
import BankSummary from '../components/BankSummary';
import { uploadBankStatement, BankAnalysis } from '../services/api';

interface UploadBankProps {
  clientId: number;
  clientName: string;
  onDone: () => void;
  onBack: () => void;
}

interface UploadedStatement {
  id: number;
  filename: string;
  bankName: string;
  analysis: BankAnalysis;
}

const UploadBank: React.FC<UploadBankProps> = ({ clientId, clientName, onDone, onBack }) => {
  const [bankName, setBankName] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedStatement[]>([]);
  const [previewAnalysis, setPreviewAnalysis] = useState<BankAnalysis | null>(null);

  const handleFileSelected = async (file: File) => {
    setLoading(true);
    setFileList([{ uid: '-1', name: file.name, status: 'uploading' }]);

    try {
      const res = await uploadBankStatement(file, clientId, clientName, bankName);
      const stmt: UploadedStatement = {
        id: res.data.id,
        filename: file.name,
        bankName: bankName || '未指定',
        analysis: res.data.analysis!,
      };
      setUploaded((prev) => [...prev, stmt]);
      setPreviewAnalysis(res.data.analysis);
      setFileList([]);
      setBankName('');
      message.success('银行流水解析完成');
    } catch (err: any) {
      setFileList([{ uid: '-1', name: file.name, status: 'error' }]);
      message.error('解析失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Card title="上传银行流水" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder="银行名称（可选，如：工商银行）"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            style={{ width: 300 }}
          />
          <Spin spinning={loading} tip="正在解析银行流水...">
            <FileUploader
              accept=".xlsx,.xls,.csv"
              hint="支持 Excel（xlsx/xls）或 CSV 文件"
              onFileSelected={handleFileSelected}
              fileList={fileList}
              loading={loading}
            />
          </Spin>
        </Space>
      </Card>

      {uploaded.length > 0 && (
        <Card title="已上传流水" style={{ marginBottom: 16 }}>
          <List
            size="small"
            dataSource={uploaded}
            renderItem={(item) => (
              <List.Item>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                {item.filename} — {item.bankName}
              </List.Item>
            )}
          />
        </Card>
      )}

      {previewAnalysis && (
        <Card title="流水分析预览（最近上传）" style={{ marginBottom: 16 }}>
          <BankSummary data={previewAnalysis} />
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button size="large" onClick={onBack}>
          ← 上一步
        </Button>
        <Button
          type="primary"
          size="large"
          disabled={uploaded.length === 0}
          onClick={onDone}
        >
          下一步：查看分析报告 →
        </Button>
      </div>
    </div>
  );
};

export default UploadBank;
```

- [ ] **Step 3: Create Report page**

Create `frontend/src/pages/Report.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Card, Tabs, Button, Space, Spin, message, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import CreditSummary from '../components/CreditSummary';
import BankSummary from '../components/BankSummary';
import AnomalyTable from '../components/AnomalyTable';
import { getAnalysis, exportExcel, exportPdf, FullAnalysis } from '../services/api';

interface ReportProps {
  clientId: number;
  onBack: () => void;
}

const Report: React.FC<ReportProps> = ({ clientId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FullAnalysis | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      const res = await getAnalysis(clientId);
      setData(res.data);
    } catch (err: any) {
      message.error('加载分析数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      const res = type === 'excel' ? await exportExcel(clientId) : await exportPdf(clientId);
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data?.client.name || '客户'}_融资分析报告.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!data) {
    return <Empty description="暂无数据" />;
  }

  const creditData = data.credit_reports.find((cr) => cr.parsed_data)?.parsed_data || null;
  const bankData = data.bank_statements.find((bs) => bs.analysis)?.analysis || null;

  const tabItems = [
    {
      key: 'credit',
      label: '征信概况',
      children: creditData ? <CreditSummary data={creditData} /> : <Empty description="暂无征信数据" />,
    },
    {
      key: 'bank',
      label: '银行流水',
      children: bankData ? <BankSummary data={bankData} /> : <Empty description="暂无流水数据" />,
    },
    {
      key: 'anomaly',
      label: '异常交易',
      children: bankData && bankData.anomalies.length > 0
        ? <AnomalyTable data={bankData.anomalies} />
        : <Empty description="未发现异常交易" />,
    },
    {
      key: 'overview',
      label: '综合评估',
      children: (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {creditData && (
              <div>
                <h4>征信要点</h4>
                <ul>
                  <li>总负债: {creditData.total_debt >= 10000 ? `${(creditData.total_debt / 10000).toFixed(2)}万` : `${creditData.total_debt}元`}</li>
                  <li>信用卡使用率: {creditData.credit_card_usage_rate}%</li>
                  <li>逾期记录: {creditData.overdue_records.length}条</li>
                  <li>近3月贷款审批查询: {creditData.query_records.recent_3m.loan_approval}次</li>
                </ul>
              </div>
            )}
            {bankData && (
              <div>
                <h4>流水要点</h4>
                <ul>
                  <li>月均收入(去重): {bankData.deduped_monthly_avg_income >= 10000 ? `${(bankData.deduped_monthly_avg_income / 10000).toFixed(2)}万` : `${bankData.deduped_monthly_avg_income}元`}</li>
                  <li>月均净利润: {bankData.monthly_avg_net >= 10000 ? `${(bankData.monthly_avg_net / 10000).toFixed(2)}万` : `${bankData.monthly_avg_net}元`}</li>
                  <li>异常交易: {bankData.anomalies.length}笔</li>
                </ul>
              </div>
            )}
          </Space>
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={`${data.client.name} — 融资分析报告`}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => handleExport('excel')}>
              导出 Excel
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={() => handleExport('pdf')}>
              导出 PDF
            </Button>
          </Space>
        }
      >
        <Tabs items={tabItems} />
      </Card>

      <div style={{ marginTop: 16 }}>
        <Button size="large" onClick={onBack}>
          ← 上一步
        </Button>
      </div>
    </div>
  );
};

export default Report;
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/frontend
npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add frontend/src/pages/
git commit -m "feat: frontend pages - UploadCredit, UploadBank, Report with full wizard flow"
```

---

### Task 11: README and Final Integration

**Files:**
- Create: `README.md`
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `.gitignore` at project root:

```
# Python
__pycache__/
*.pyc
*.pyo
backend/venv/
backend/data/
backend/uploads/
*.egg-info/

# Node
node_modules/
frontend/dist/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Superpowers
.superpowers/
```

- [ ] **Step 2: Create README.md**

Create `README.md` at project root:

```markdown
# 企业融资数据智能分析工具

帮助融资顾问上传客户征信报告和银行流水，自动解析分析并输出结构化数据报告。

## 功能

- **征信报告解析** — 上传PDF或图片，自动提取负债、逾期、查询记录等
- **银行流水分析** — 上传Excel/CSV，汇总收支、识别异常交易、去重统计
- **导出报告** — 在线查看 + 导出Excel/PDF

## 系统要求

- Python 3.10+
- Node.js 18+
- Tesseract OCR（用于图片识别）
- Poppler（用于PDF转图片）

## 安装

### 1. 安装系统依赖（macOS）

```bash
brew install tesseract poppler
brew install tesseract-lang  # 中文语言包
```

### 2. 安装后端依赖

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

## 启动

### 启动后端（端口8000）

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 启动前端（端口5173）

```bash
cd frontend
npm run dev
```

打开浏览器访问 http://localhost:5173

## 使用流程

1. **输入客户姓名** → 上传征信报告（PDF/图片）→ 查看解析结果
2. **上传银行流水**（Excel/CSV）→ 查看分析结果
3. **查看完整报告** → 导出Excel或PDF

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Ant Design 5 |
| 后端 | Python FastAPI |
| PDF解析 | pdfplumber |
| OCR | Tesseract |
| Excel | pandas + openpyxl |
| 数据库 | SQLite |

## API文档

启动后端后访问 http://localhost:8000/docs 查看自动生成的API文档。
```

- [ ] **Step 3: Install system dependencies**

```bash
brew install tesseract poppler
```

Note: `tesseract-lang` for Chinese support may need separate installation. If `chi_sim` is not available, run `brew install tesseract-lang`.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
python -m pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 5: Verify full stack runs end-to-end**

Terminal 1:
```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Terminal 2:
```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本/frontend
npm run dev
```

Open http://localhost:5173 and verify:
1. Step navigation renders
2. Client name input works
3. File upload area renders

- [ ] **Step 6: Commit**

```bash
cd /Users/renhai2025/Desktop/征信报告:银行流水分析脚本
git add .gitignore README.md
git commit -m "docs: add README with installation and usage instructions"
```
