"""Unit tests for services.bank_diagnosis (阶段 A)。"""

from types import SimpleNamespace
import pytest

from services.bank_diagnosis import (
    compute_ratios,
    build_risks_and_suggestions,
    merge_client_transactions,
    build_bank_diagnosis_report,
    THRESHOLDS,
)


def _mk_ctx(target_loan_amount=None, monthly=None, existing_monthly_payment=None):
    return SimpleNamespace(
        target_loan_amount=target_loan_amount,
        existing_monthly_payment=existing_monthly_payment if existing_monthly_payment is not None else monthly,
        industry=None,
        apply_deadline=None,
        related_parties=[],
    )


def _mk_analysis(income=100000.0, expense=80000.0, monthly_incomes=None, min_balance=5000.0):
    monthly_incomes = monthly_incomes or [100000, 100000, 100000]
    monthly_summary = [
        {"month": f"2026-{i+1:02d}", "income": v, "expense": v * 0.8, "net": v * 0.2, "tx_count": 30}
        for i, v in enumerate(monthly_incomes)
    ]
    n = len(monthly_incomes)
    return {
        "deduped_monthly_avg_income": sum(monthly_incomes) / n,
        "deduped_monthly_avg_expense": sum(monthly_incomes) / n * 0.8,
        "min_balance": min_balance,
        "monthly_summary": monthly_summary,
        "top_income_sources": [],
    }


# ─── compute_ratios ───

def test_compute_ratios_healthy():
    ctx = _mk_ctx(target_loan_amount=500000, monthly=20000)
    analysis = _mk_analysis(monthly_incomes=[100000, 105000, 95000])
    r = compute_ratios(analysis, ctx)
    assert r["coverage_ratio"] == 5.0                # 100k / 20k
    assert r["balance_ratio"] == 0.2                 # (income - 0.8*income) / income
    assert r["volatility_coef"] is not None
    assert r["loan_cover_ratio"] == 0.2              # 100k / 500k
    assert r["low_balance_ratio"] == 0.05            # 5k / 100k


def test_compute_ratios_missing_context():
    ctx = _mk_ctx()
    analysis = _mk_analysis()
    r = compute_ratios(analysis, ctx)
    assert r["coverage_ratio"] is None
    assert r["loan_cover_ratio"] is None
    # 其他仍应算出
    assert r["balance_ratio"] is not None


def test_compute_ratios_zero_income():
    ctx = _mk_ctx(monthly=10000)
    analysis = _mk_analysis(monthly_incomes=[0, 0, 0])
    r = compute_ratios(analysis, ctx)
    # 除零保护
    assert r["balance_ratio"] is None
    assert r["volatility_coef"] is None
    assert r["coverage_ratio"] == 0.0  # 0 / 10000 = 0


# ─── rules: risks & suggestions ───

def test_rules_low_coverage_yields_high_risk():
    # 覆盖率 0.5 远低于警戒线 1.5
    ratios = {"coverage_ratio": 0.5, "balance_ratio": None, "volatility_coef": None,
              "low_balance_ratio": None, "loan_cover_ratio": None}
    out = build_risks_and_suggestions(ratios, {"top_income_sources": []})
    cats = [r["category"] for r in out["risks"]]
    assert "偿债覆盖" in cats
    hi = [r for r in out["risks"] if r["category"] == "偿债覆盖"][0]
    assert hi["level"] == "high"
    assert out["suggestions"]


def test_rules_healthy_produces_no_risk():
    ratios = {
        "coverage_ratio": 3.0,       # > 2.0
        "balance_ratio": 0.3,        # > 0.2
        "volatility_coef": 0.1,      # < 0.3
        "low_balance_ratio": 0.2,    # > 0.10
        "loan_cover_ratio": 0.15,    # > 0.10
    }
    out = build_risks_and_suggestions(ratios, {"top_income_sources": []})
    # 仅剩 data-missing 风险（若任何 None），此处全非 None，应无风险
    non_info = [r for r in out["risks"] if r["category"] != "数据缺失"]
    assert non_info == []


def test_rules_top_counterparty_dominates():
    ratios = {k: None for k in
              ("coverage_ratio", "balance_ratio", "volatility_coef", "low_balance_ratio", "loan_cover_ratio")}
    analysis = {"top_income_sources": [{"counterparty": "大客户甲", "amount": 1_000_000, "ratio": 68.5}]}
    out = build_risks_and_suggestions(ratios, analysis)
    assert any(r["category"] == "收入集中" for r in out["risks"])


def test_rules_sorted_high_first():
    ratios = {
        "coverage_ratio": 0.5,       # high
        "balance_ratio": 0.15,       # medium (warn 0.10 < x < healthy 0.20)
        "volatility_coef": 0.4,      # medium
        "low_balance_ratio": None,
        "loan_cover_ratio": 0.08,    # medium
    }
    out = build_risks_and_suggestions(ratios, {"top_income_sources": []})
    non_info = [r for r in out["risks"] if r["category"] != "数据缺失"]
    levels = [r["level"] for r in non_info]
    # high 必须在 medium 之前
    if "high" in levels and "medium" in levels:
        assert levels.index("high") < levels.index("medium")


# ─── merge_client_transactions ───

def test_merge_collapses_multiple_statements():
    client = SimpleNamespace(id=1, name="张三", company_name=None)
    s1 = SimpleNamespace(
        raw_data=[{"date": "2026-01-05", "counterparty": "客户A", "description": "", "income": 10000, "expense": 0, "balance": 10000}],
        bank_name="工行",
    )
    s2 = SimpleNamespace(
        raw_data=[{"date": "2026-02-05", "counterparty": "客户B", "description": "", "income": 20000, "expense": 0, "balance": 30000}],
        bank_name="建行",
    )
    res = merge_client_transactions(client, [s1, s2], None)
    assert res["account_count"] == 2
    assert set(res["banks"]) == {"工行", "建行"}
    assert res["total_income"] == 30000


def test_merge_flags_cross_account_self_transfer():
    client = SimpleNamespace(id=1, name="张三", company_name="张三公司")
    # 对手方等于公司名 → 视为自身/关联转账，should be deduped
    s1 = SimpleNamespace(
        raw_data=[
            {"date": "2026-01-05", "counterparty": "张三公司", "description": "", "income": 0, "expense": 50000, "balance": 50000},
            {"date": "2026-01-06", "counterparty": "真实客户", "description": "", "income": 30000, "expense": 0, "balance": 80000},
        ],
        bank_name="工行",
    )
    res = merge_client_transactions(client, [s1], None)
    # 真实业务收入 30k，自转 50k 支出应被识别
    assert res["total_expense"] == 50000
    # 去重后支出应为 0（被标记为 duplicate）
    assert res["deduped_total_expense"] == 0
    assert res["deduped_total_income"] == 30000


def test_merge_empty_statements():
    client = SimpleNamespace(id=1, name="张三", company_name=None)
    res = merge_client_transactions(client, [], None)
    assert res["total_income"] == 0
    assert res["account_count"] == 0


# ─── build_bank_diagnosis_report end-to-end ───

def test_build_report_smoke():
    client = SimpleNamespace(id=1, name="李四", company_name="李四商贸")
    ctx = _mk_ctx(target_loan_amount=200000, monthly=15000)
    s1 = SimpleNamespace(
        raw_data=[
            {"date": "2026-01-05", "counterparty": "客户A", "description": "货款", "income": 50000, "expense": 0, "balance": 50000},
            {"date": "2026-02-05", "counterparty": "客户A", "description": "货款", "income": 50000, "expense": 0, "balance": 100000},
            {"date": "2026-03-05", "counterparty": "客户A", "description": "货款", "income": 50000, "expense": 0, "balance": 150000},
        ],
        bank_name="工行",
    )
    report = build_bank_diagnosis_report(client, [s1], ctx)
    assert report["client_name"] == "李四"
    assert "overview" in report
    assert "ratios" in report
    assert isinstance(report["risks"], list)
    assert isinstance(report["suggestions"], list)
    # 单一对手方 100% 应触发"收入集中"
    assert any(r["category"] == "收入集中" for r in report["risks"])
    # 覆盖率 = 50k / 15k ≈ 3.33，健康，不应有"偿债覆盖"风险
    assert not any(r["category"] == "偿债覆盖" for r in report["risks"])


# ─── compute_annual_overview ───

from services.bank_diagnosis import compute_annual_overview


def _mk_monthly_summary(n_months, income_per_month=1_500_000, start_year=2025, start_month=5):
    """Generate n consecutive months of monthly_summary (deduped_income = income, no self-transfer)"""
    out = []
    y, m = start_year, start_month
    for _ in range(n_months):
        out.append({
            "month": f"{y:04d}-{m:02d}",
            "income": income_per_month,
            "expense": income_per_month * 0.8,
            "deduped_income": income_per_month,
            "deduped_expense": income_per_month * 0.8,
            "net": income_per_month * 0.2,
            "tx_count": 30,
        })
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def test_annual_overview_full_12_months():
    analysis = {"monthly_summary": _mk_monthly_summary(12, income_per_month=1_500_000)}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 12
    assert ov["annual_revenue"] == 18_000_000       # 1.5M × 12
    assert ov["monthly_avg_income"] == 1_500_000    # annual / 12
    assert ov["is_annualized"] is False
    assert ov["size_tier"] == "medium"              # 500万–3000万
    assert ov["full_window_months"] == 12


def test_annual_overview_partial_6_months():
    analysis = {"monthly_summary": _mk_monthly_summary(6, income_per_month=500_000)}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 6
    assert ov["annual_revenue"] == 3_000_000        # actual 6-month total
    assert ov["is_annualized"] is True
    assert ov["annualized_hint"] is not None        # "≈ 年化 ¥6,000,000（×2.0 估算）"
    assert "年化" in ov["annualized_hint"]


def test_annual_overview_over_12_months_truncates():
    analysis = {"monthly_summary": _mk_monthly_summary(18, income_per_month=1_000_000)}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 12                # truncated
    assert ov["annual_revenue"] == 12_000_000       # near-12 months
    assert ov["full_window_months"] == 18           # full period still = 18
    assert ov["full_window_revenue"] == 18_000_000
    assert ov["is_annualized"] is False


def test_annual_overview_zero():
    analysis = {"monthly_summary": []}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 0
    assert ov["annual_revenue"] == 0
    assert ov["size_tier"] == "micro"
    assert ov["is_annualized"] is False             # zero flow is not annualized


def test_annual_overview_size_tier_boundaries():
    """Verify tier classification thresholds"""
    # micro: 10万/year → < 50万
    a1 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=8_333)}
    assert compute_annual_overview(a1)["size_tier"] == "micro"

    # small: 200万/year (50-500万)
    a2 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=166_667)}
    assert compute_annual_overview(a2)["size_tier"] == "small"

    # large: 5000万/year (3000万-1亿)
    a3 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=4_166_667)}
    assert compute_annual_overview(a3)["size_tier"] == "large"

    # xlarge: 1.5亿/year (>1亿)
    a4 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=12_500_000)}
    assert compute_annual_overview(a4)["size_tier"] == "xlarge"
