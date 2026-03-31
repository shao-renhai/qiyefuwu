"""
Bank statement analyzer: deduplication, anomaly detection, and summary statistics.
"""

import copy
from collections import defaultdict
from typing import List, Dict, Any


# Keywords indicating WeChat/Alipay withdrawal transactions (duplicates)
WITHDRAWAL_KEYWORDS = ["微信提现", "支付宝提现", "微信转账", "支付宝转账"]


def mark_duplicates(
    transactions: List[Dict[str, Any]],
    account_holder: str,
) -> List[Dict[str, Any]]:
    """
    Mark duplicate/self-transfer transactions.

    Rules:
    - Self-transfers: counterparty matches account_holder
    - WeChat/Alipay withdrawals: description contains withdrawal keywords
    """
    result = copy.deepcopy(transactions)

    for tx in result:
        tx.setdefault("is_duplicate", False)
        tx.setdefault("duplicate_reason", "")

        # Check self-transfer: counterparty matches account holder
        if tx["counterparty"] == account_holder:
            tx["is_duplicate"] = True
            tx["duplicate_reason"] = f"自身转账（对手方为{account_holder}）"
            continue

        # Check WeChat/Alipay withdrawal keywords in description
        for keyword in WITHDRAWAL_KEYWORDS:
            if keyword in tx.get("description", ""):
                tx["is_duplicate"] = True
                tx["duplicate_reason"] = f"提现交易（{keyword}）"
                break

    return result


def detect_anomalies(
    transactions: List[Dict[str, Any]],
    monthly_avg_income: float,
) -> List[Dict[str, Any]]:
    """
    Detect anomalous transactions.

    Rules:
    - Large amount: single transaction amount > monthly_avg_income * 2
    - Round number: large round amounts (>=100k, divisible by 10k) appearing 3+ times
    - Regular pattern: same counterparty + same amount appearing 3+ times
    """
    anomalies = []
    threshold = monthly_avg_income * 2

    # --- Large amount detection ---
    for tx in transactions:
        amount = max(tx.get("income", 0), tx.get("expense", 0))
        if amount > threshold:
            anomalies.append({
                "type": "large_amount",
                "date": tx["date"],
                "counterparty": tx.get("counterparty", ""),
                "description": tx.get("description", ""),
                "amount": amount,
                "detail": f"单笔金额{amount}超过月均收入的2倍({threshold})",
            })

    # --- Round number detection ---
    round_amounts = defaultdict(int)
    for tx in transactions:
        amount = max(tx.get("income", 0), tx.get("expense", 0))
        if amount >= 100000 and amount % 10000 == 0:
            round_amounts[amount] += 1
    for amount, count in round_amounts.items():
        if count >= 3:
            anomalies.append({
                "type": "round_number",
                "amount": amount,
                "count": count,
                "detail": f"整数金额{amount}出现{count}次",
            })

    # --- Regular pattern detection ---
    pattern_counts: Dict[tuple, int] = defaultdict(int)
    for tx in transactions:
        amount = max(tx.get("income", 0), tx.get("expense", 0))
        key = (tx.get("counterparty", ""), amount)
        if key[0]:  # only count if counterparty is non-empty
            pattern_counts[key] += 1
    for (counterparty, amount), count in pattern_counts.items():
        if count >= 3:
            anomalies.append({
                "type": "regular_pattern",
                "counterparty": counterparty,
                "amount": amount,
                "count": count,
                "detail": f"{counterparty}以金额{amount}交易{count}次",
            })

    return anomalies


def analyze_bank_statement(
    transactions: List[Dict[str, Any]],
    account_holder: str,
) -> Dict[str, Any]:
    """
    Full analysis of bank statement transactions.

    Returns a dict with:
    - Raw totals (total_income, total_expense, monthly averages)
    - Deduped totals (excluding marked duplicates)
    - Top 5 income sources and expense categories (by counterparty)
    - Monthly ending balances, min/avg balance
    - Monthly and daily tx counts
    - Monthly summary breakdown
    - Anomaly detection results
    """
    if not transactions:
        return _empty_result()

    # Mark duplicates
    txns = mark_duplicates(transactions, account_holder)

    # --- Raw totals ---
    total_income = sum(tx.get("income", 0) for tx in txns)
    total_expense = sum(tx.get("expense", 0) for tx in txns)

    # Determine number of months
    months = _get_months(txns)
    num_months = max(len(months), 1)

    monthly_avg_income = total_income / num_months
    monthly_avg_expense = total_expense / num_months
    monthly_avg_net = (total_income - total_expense) / num_months

    # --- Deduped totals ---
    non_dup = [tx for tx in txns if not tx.get("is_duplicate", False)]
    deduped_total_income = sum(tx.get("income", 0) for tx in non_dup)
    deduped_total_expense = sum(tx.get("expense", 0) for tx in non_dup)
    deduped_monthly_avg_income = deduped_total_income / num_months
    deduped_monthly_avg_expense = deduped_total_expense / num_months

    # --- Top income sources and expense categories (by counterparty) ---
    income_by_cp = defaultdict(float)
    expense_by_cp = defaultdict(float)
    for tx in txns:
        cp = tx.get("counterparty", "")
        if cp:
            income_by_cp[cp] += tx.get("income", 0)
            expense_by_cp[cp] += tx.get("expense", 0)

    top_income_sources = sorted(
        [{"counterparty": k, "total": v} for k, v in income_by_cp.items() if v > 0],
        key=lambda x: x["total"],
        reverse=True,
    )[:5]

    top_expense_categories = sorted(
        [{"counterparty": k, "total": v} for k, v in expense_by_cp.items() if v > 0],
        key=lambda x: x["total"],
        reverse=True,
    )[:5]

    # --- Monthly ending balances ---
    monthly_last_balance = {}
    for tx in txns:
        month = tx["date"][:7]  # YYYY-MM
        monthly_last_balance[month] = tx.get("balance", 0)

    monthly_ending_balances = [
        {"month": m, "balance": b}
        for m, b in sorted(monthly_last_balance.items())
    ]

    all_balances = [tx.get("balance", 0) for tx in txns]
    min_balance = min(all_balances) if all_balances else 0
    avg_balance = sum(all_balances) / len(all_balances) if all_balances else 0

    # --- Transaction frequency ---
    tx_counts_by_month = defaultdict(int)
    for tx in txns:
        month = tx["date"][:7]
        tx_counts_by_month[month] += 1

    monthly_avg_tx_count = len(txns) / num_months

    # Approximate daily average: total txns / number of calendar days spanned
    dates = sorted(set(tx["date"] for tx in txns))
    if len(dates) >= 2:
        from datetime import datetime
        first = datetime.strptime(dates[0], "%Y-%m-%d")
        last = datetime.strptime(dates[-1], "%Y-%m-%d")
        days_span = max((last - first).days, 1)
        daily_avg_tx_count = len(txns) / days_span
    else:
        daily_avg_tx_count = float(len(txns))

    # --- Monthly summary ---
    monthly_summary = []
    for month in sorted(months):
        month_txns = [tx for tx in txns if tx["date"][:7] == month]
        m_income = sum(tx.get("income", 0) for tx in month_txns)
        m_expense = sum(tx.get("expense", 0) for tx in month_txns)
        m_count = len(month_txns)
        monthly_summary.append({
            "month": month,
            "income": m_income,
            "expense": m_expense,
            "net": m_income - m_expense,
            "tx_count": m_count,
        })

    # --- Anomaly detection ---
    anomalies = detect_anomalies(txns, monthly_avg_income)

    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "monthly_avg_income": monthly_avg_income,
        "monthly_avg_expense": monthly_avg_expense,
        "monthly_avg_net": monthly_avg_net,
        "deduped_total_income": deduped_total_income,
        "deduped_total_expense": deduped_total_expense,
        "deduped_monthly_avg_income": deduped_monthly_avg_income,
        "deduped_monthly_avg_expense": deduped_monthly_avg_expense,
        "top_income_sources": top_income_sources,
        "top_expense_categories": top_expense_categories,
        "monthly_ending_balances": monthly_ending_balances,
        "min_balance": min_balance,
        "avg_balance": avg_balance,
        "monthly_avg_tx_count": monthly_avg_tx_count,
        "daily_avg_tx_count": daily_avg_tx_count,
        "monthly_summary": monthly_summary,
        "anomalies": anomalies,
    }


def _get_months(transactions: List[Dict[str, Any]]) -> List[str]:
    """Extract unique YYYY-MM months from transactions."""
    months = set()
    for tx in transactions:
        date_str = tx.get("date", "")
        if len(date_str) >= 7:
            months.add(date_str[:7])
    return sorted(months)


def _empty_result() -> Dict[str, Any]:
    """Return an empty analysis result."""
    return {
        "total_income": 0.0,
        "total_expense": 0.0,
        "monthly_avg_income": 0.0,
        "monthly_avg_expense": 0.0,
        "monthly_avg_net": 0.0,
        "deduped_total_income": 0.0,
        "deduped_total_expense": 0.0,
        "deduped_monthly_avg_income": 0.0,
        "deduped_monthly_avg_expense": 0.0,
        "top_income_sources": [],
        "top_expense_categories": [],
        "monthly_ending_balances": [],
        "min_balance": 0.0,
        "avg_balance": 0.0,
        "monthly_avg_tx_count": 0.0,
        "daily_avg_tx_count": 0.0,
        "monthly_summary": [],
        "anomalies": [],
    }
