import sys
import os
import copy

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.analyzer import mark_duplicates, detect_anomalies, analyze_bank_statement


def test_mark_duplicates_wechat(sample_transactions, account_holder):
    """Transactions with '微信提现' in description should be marked as duplicate."""
    result = mark_duplicates(sample_transactions, account_holder)
    wechat_txs = [tx for tx in result if "微信提现" in tx["description"]]
    assert len(wechat_txs) == 1
    assert wechat_txs[0]["is_duplicate"] is True
    assert "微信" in wechat_txs[0]["duplicate_reason"] or "提现" in wechat_txs[0]["duplicate_reason"]


def test_mark_duplicates_self_transfer(sample_transactions, account_holder):
    """Transactions where counterparty matches account holder should be marked as duplicate."""
    result = mark_duplicates(sample_transactions, account_holder)
    self_txs = [tx for tx in result if tx["counterparty"] == account_holder]
    assert len(self_txs) == 2  # 张三 appears twice as counterparty
    for tx in self_txs:
        assert tx["is_duplicate"] is True


def test_analyze_totals(sample_transactions, account_holder):
    """Raw totals: total_income=185000, total_expense=35500."""
    result = analyze_bank_statement(sample_transactions, account_holder)
    assert result["total_income"] == 185000.0
    assert result["total_expense"] == 35500.0


def test_analyze_deduped_totals(sample_transactions, account_holder):
    """Deduped totals exclude wechat 20k income and self-transfer 10k+15k expense."""
    result = analyze_bank_statement(sample_transactions, account_holder)
    # deduped income = 185000 - 20000 = 165000
    assert result["deduped_total_income"] == 165000.0
    # deduped expense = 35500 - 10000 - 15000 = 10500
    assert result["deduped_total_expense"] == 10500.0


def test_analyze_monthly_avg(sample_transactions, account_holder):
    """Monthly averages over 2 months."""
    result = analyze_bank_statement(sample_transactions, account_holder)
    # 2 months of data
    assert result["monthly_avg_income"] == 185000.0 / 2
    assert result["monthly_avg_expense"] == 35500.0 / 2


def test_detect_anomalies_large_amount(sample_transactions):
    """With normal data, no large amount anomaly should trigger (max tx 50k, threshold = avg_income*2)."""
    # monthly_avg_income = 92500 (185000 / 2), threshold = 185000
    # max single tx is 50000, so no trigger
    anomalies = detect_anomalies(sample_transactions, monthly_avg_income=92500.0)
    large_amount_anomalies = [a for a in anomalies if a["type"] == "large_amount"]
    assert len(large_amount_anomalies) == 0


def test_detect_anomalies_large_amount_triggers(sample_transactions):
    """A 500k transaction should trigger when monthly_avg_income is 50k (threshold=100k)."""
    txns = copy.deepcopy(sample_transactions)
    txns.append({
        "date": "2026-02-28",
        "counterparty": "大客户",
        "description": "大额收款",
        "income": 500000.0,
        "expense": 0.0,
        "balance": 749500.0,
    })
    anomalies = detect_anomalies(txns, monthly_avg_income=50000.0)
    large_amount_anomalies = [a for a in anomalies if a["type"] == "large_amount"]
    assert len(large_amount_anomalies) >= 1
    # The 500k tx should be flagged
    amounts = [a["amount"] for a in large_amount_anomalies]
    assert 500000.0 in amounts


def test_analyze_top_income_sources(sample_transactions, account_holder):
    """某公司 should be the top income source (50k + 50k = 100k)."""
    result = analyze_bank_statement(sample_transactions, account_holder)
    top_sources = result["top_income_sources"]
    assert len(top_sources) > 0
    assert top_sources[0]["counterparty"] == "某公司"


def test_monthly_summary_contains_deduped_fields():
    """monthly_summary 每条应携带 deduped_income / deduped_expense"""
    txns = [
        # 真实业务
        {"date": "2026-01-05", "counterparty": "客户A", "description": "货款",
         "income": 10000, "expense": 0, "balance": 10000},
        # 自转（对手方 = 持有人）
        {"date": "2026-01-06", "counterparty": "张三", "description": "自转",
         "income": 5000, "expense": 0, "balance": 15000},
        # 提现关键字（会被 mark_duplicates 剔除）
        {"date": "2026-01-08", "counterparty": "微信", "description": "微信提现",
         "income": 3000, "expense": 0, "balance": 18000},
    ]
    result = analyze_bank_statement(txns, "张三")
    m = result["monthly_summary"]
    assert len(m) == 1
    row = m[0]
    assert row["income"] == 18000          # 原始
    assert row["deduped_income"] == 10000  # 只留真实业务
    assert "deduped_expense" in row
