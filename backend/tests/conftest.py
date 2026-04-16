import sys
import os
import pytest
import pandas as pd
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


def make_sample_transactions():
    """Return 10 sample transaction dicts for testing."""
    return [
        {"date": "2026-01-05", "counterparty": "某公司", "description": "工资", "income": 50000.0, "expense": 0.0, "balance": 150000.0},
        {"date": "2026-01-10", "counterparty": "张三", "description": "转账", "income": 0.0, "expense": 10000.0, "balance": 140000.0},
        {"date": "2026-01-15", "counterparty": "超市", "description": "消费", "income": 0.0, "expense": 3000.0, "balance": 137000.0},
        {"date": "2026-01-20", "counterparty": "微信", "description": "微信提现", "income": 20000.0, "expense": 0.0, "balance": 157000.0},
        {"date": "2026-01-25", "counterparty": "客户A", "description": "货款", "income": 30000.0, "expense": 0.0, "balance": 187000.0},
        {"date": "2026-02-05", "counterparty": "某公司", "description": "工资", "income": 50000.0, "expense": 0.0, "balance": 237000.0},
        {"date": "2026-02-10", "counterparty": "张三", "description": "转账给张三", "income": 0.0, "expense": 15000.0, "balance": 222000.0},
        {"date": "2026-02-15", "counterparty": "超市", "description": "消费", "income": 0.0, "expense": 2500.0, "balance": 219500.0},
        {"date": "2026-02-20", "counterparty": "银行", "description": "还款", "income": 0.0, "expense": 5000.0, "balance": 214500.0},
        {"date": "2026-02-25", "counterparty": "客户B", "description": "货款", "income": 35000.0, "expense": 0.0, "balance": 249500.0},
    ]


@pytest.fixture
def sample_transactions():
    return make_sample_transactions()


@pytest.fixture
def sample_excel_file(tmp_path):
    """Create a sample Excel file with Chinese column headers."""
    txns = make_sample_transactions()
    df = pd.DataFrame(txns)
    df.columns = ["交易日期", "交易对手", "摘要", "收入", "支出", "余额"]
    filepath = tmp_path / "test_bank.xlsx"
    df.to_excel(str(filepath), index=False)
    return str(filepath)


@pytest.fixture
def sample_csv_file(tmp_path):
    """Create a sample CSV file with Chinese column headers."""
    txns = make_sample_transactions()
    df = pd.DataFrame(txns)
    df.columns = ["交易日期", "交易对手", "摘要", "收入", "支出", "余额"]
    filepath = tmp_path / "test_bank.csv"
    df.to_csv(str(filepath), index=False)
    return str(filepath)


@pytest.fixture
def account_holder():
    return "张三"


from fastapi.testclient import TestClient


@pytest.fixture
def api_client():
    """Clean API test client with DB reset."""
    from db.database import Base, engine
    from main import app
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _register_and_auth(api_client, username, password="test123", display_name=None):
    r = api_client.post("/api/auth/register", json={
        "username": username,
        "password": password,
        "display_name": display_name or username,
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _set_user_role(username, role):
    from db.database import SessionLocal, User
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    user.role = role
    db.commit()
    db.close()


@pytest.fixture
def founder_headers(api_client):
    token = _register_and_auth(api_client, "founder_u")
    _set_user_role("founder_u", "founder")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def consultant_headers(api_client):
    token = _register_and_auth(api_client, "consultant_u")
    _set_user_role("consultant_u", "consultant")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def telesales_headers(api_client):
    token = _register_and_auth(api_client, "telesales_u")
    _set_user_role("telesales_u", "telesales")
    return {"Authorization": f"Bearer {token}"}
