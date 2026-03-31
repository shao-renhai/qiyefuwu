import sys
import os
import pytest
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from db.database import Base, engine
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db():
    """Reset the database before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def sample_bank_excel(tmp_path):
    """Create a sample Excel file for bank statement upload tests."""
    data = {
        "交易日期": ["2026-01-05", "2026-01-10", "2026-01-15", "2026-02-05", "2026-02-10"],
        "交易对手": ["某公司", "张三", "超市", "某公司", "客户A"],
        "摘要": ["工资", "转账", "消费", "工资", "货款"],
        "收入": [50000.0, 0.0, 0.0, 50000.0, 30000.0],
        "支出": [0.0, 10000.0, 3000.0, 0.0, 0.0],
        "余额": [150000.0, 140000.0, 137000.0, 187000.0, 217000.0],
    }
    df = pd.DataFrame(data)
    filepath = tmp_path / "test_bank.xlsx"
    df.to_excel(str(filepath), index=False)
    return str(filepath)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_create_and_list_clients():
    r = client.post("/api/clients/", json={"name": "张三"})
    assert r.status_code == 200
    assert r.json()["name"] == "张三"

    r = client.get("/api/clients/")
    assert len(r.json()) == 1


def test_get_client():
    r = client.post("/api/clients/", json={"name": "李四"})
    client_id = r.json()["id"]

    r = client.get(f"/api/clients/{client_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "李四"


def test_get_client_not_found():
    r = client.get("/api/clients/9999")
    assert r.status_code == 404


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
    assert r.json()["analysis"]["total_income"] > 0


def test_get_analysis(sample_bank_excel):
    # Create client and upload statement
    r = client.post("/api/clients/", json={"name": "张三"})
    client_id = r.json()["id"]

    with open(sample_bank_excel, "rb") as f:
        client.post(
            "/api/bank-statement/upload",
            files={"file": ("test.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"client_id": str(client_id), "account_holder": "张三"},
        )

    r = client.get(f"/api/analysis/{client_id}")
    assert r.status_code == 200
    assert r.json()["client"]["name"] == "张三"
    assert len(r.json()["bank_statements"]) == 1


def test_upload_unsupported_file():
    r = client.post("/api/clients/", json={"name": "张三"})
    client_id = r.json()["id"]

    r = client.post(
        "/api/bank-statement/upload",
        files={"file": ("test.txt", b"hello", "text/plain")},
        data={"client_id": str(client_id), "account_holder": "张三"},
    )
    assert r.status_code == 400
