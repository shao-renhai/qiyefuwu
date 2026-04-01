"""
Credit report parser for Chinese PBOC credit reports.

Extracts structured data from credit report text including debt summaries,
credit card info, overdue records, and query records.
"""

import re
from datetime import datetime, timedelta
from typing import Optional


def _extract_amount(text: str) -> float:
    """Extract numeric amount from text like '85万', '23.5万', '1000元', '50000'.

    Supports:
        - X万 -> X * 10000
        - X元 -> X
        - plain numbers
    Returns 0.0 if no number found.
    """
    # Match number followed by 万
    m = re.search(r"([\d.]+)\s*万", text)
    if m:
        return float(m.group(1)) * 10000

    # Match number followed by 元
    m = re.search(r"([\d.]+)\s*元", text)
    if m:
        return float(m.group(1))

    # Match plain number
    m = re.search(r"([\d.]+)", text)
    if m:
        return float(m.group(1))

    return 0.0


def parse_debt_summary(text: str) -> dict:
    """Parse debt section from credit report text.

    Looks for loan types: 住房贷款, 商用房贷款, 其他贷款, 消费贷, 经营贷
    with associated amounts.

    Returns dict with:
        - total_debt: total debt amount
        - total_balance: total outstanding balance
        - institution_details: list of dicts per loan type
        - active_loans: total number of active loans
    """
    loan_types = ["住房贷款", "商用房贷款", "其他贷款", "消费贷", "经营贷"]
    institution_details = []
    total_balance = 0.0
    active_loans = 0

    for loan_type in loan_types:
        # Match the loan type line and extract balance and count
        pattern = rf"(?:个人)?{re.escape(loan_type)}\s*.*?(?:笔数|笔)\s*(\d+)?"
        match = re.search(pattern, text)
        if not match:
            # Try simpler pattern: just loan type followed by content on same line
            pattern2 = rf"(?:个人)?{re.escape(loan_type)}[^\n]*"
            match2 = re.search(pattern2, text)
            if match2:
                line = match2.group(0)
                # Extract balance
                bal_match = re.search(r"余额\s*([\d.]+\s*万?元?)", line)
                balance = _extract_amount(bal_match.group(1)) if bal_match else 0.0

                # Extract loan count
                count_match = re.search(r"笔数?\s*(\d+)", line)
                count = int(count_match.group(1)) if count_match else 1

                if balance > 0 or count_match:
                    institution_details.append({
                        "type": loan_type,
                        "count": count,
                        "balance": balance,
                    })
                    total_balance += balance
                    active_loans += count
            continue

        line_start = match.start()
        line_end = text.find("\n", line_start)
        if line_end == -1:
            line_end = len(text)
        line = text[line_start:line_end]

        # Extract balance from the line
        bal_match = re.search(r"余额\s*([\d.]+\s*万?元?)", line)
        balance = _extract_amount(bal_match.group(1)) if bal_match else 0.0

        # Extract count
        count_match = re.search(r"笔数?\s*(\d+)", line)
        count = int(count_match.group(1)) if count_match else 1

        institution_details.append({
            "type": loan_type,
            "count": count,
            "balance": balance,
        })
        total_balance += balance
        active_loans += count

    return {
        "total_debt": total_balance,
        "total_balance": total_balance,
        "institution_details": institution_details,
        "active_loans": active_loans,
    }


def parse_credit_card_info(text: str) -> dict:
    """Extract credit card information.

    Looks for 授信总额 and 已用额度, calculates usage rate.

    Returns dict with:
        - total_limit: total credit limit
        - used: amount used
        - usage_rate: used/total * 100 (0.0 if no limit)
    """
    # Extract total credit limit
    limit_match = re.search(r"授信总额\s*([\d.]+\s*万?元?)", text)
    total_limit = _extract_amount(limit_match.group(1)) if limit_match else 0.0

    # Extract used amount
    used_match = re.search(r"已用额度\s*([\d.]+\s*万?元?)", text)
    used = _extract_amount(used_match.group(1)) if used_match else 0.0

    # Calculate usage rate
    usage_rate = (used / total_limit * 100) if total_limit > 0 else 0.0

    return {
        "total_limit": total_limit,
        "used": used,
        "usage_rate": usage_rate,
    }


def parse_overdue_records(text: str) -> dict:
    """Parse overdue record counts and details.

    Looks for patterns like 当前逾期X笔, 历史逾期X笔.

    Returns dict with:
        - current_overdue: number of current overdue entries
        - historical_overdue: number of historical overdue entries
        - details: list of overdue detail entries (date, amount, etc.)
    """
    current = 0
    historical = 0
    details = []

    # Current overdue count
    m = re.search(r"当前逾期\s*(\d+)\s*笔", text)
    if m:
        current = int(m.group(1))

    # Historical overdue count
    m = re.search(r"历史逾期\s*(\d+)\s*笔", text)
    if m:
        historical = int(m.group(1))

    # Try to extract detailed overdue entries (date + amount patterns)
    detail_pattern = r"(\d{4}[-/]\d{2}[-/]\d{2})\s+逾期.*?(\d[\d.]*\s*万?元?)"
    for match in re.finditer(detail_pattern, text):
        details.append({
            "date": match.group(1),
            "amount": _extract_amount(match.group(2)),
        })

    return {
        "current_overdue": current,
        "historical_overdue": historical,
        "details": details,
    }


def parse_query_records(text: str, reference_date: Optional[str] = None) -> dict:
    """Parse query records from credit report.

    Extracts query entries with date and type (贷款审批, 信用卡审批,
    法人资格审查, 法人审查). Counts by time period.

    Args:
        text: credit report text
        reference_date: reference date string (YYYY-MM-DD), defaults to today

    Returns dict with period counts:
        - recent_1m, recent_3m, recent_6m, recent_1y
        Each period has: loan_approval, corporate_review counts
        - entries: list of all parsed query entries
    """
    if reference_date:
        ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    else:
        ref_date = datetime.now()

    # Define time boundaries
    boundary_1m = ref_date - timedelta(days=30)
    boundary_3m = ref_date - timedelta(days=90)
    boundary_6m = ref_date - timedelta(days=180)
    boundary_1y = ref_date - timedelta(days=365)

    periods = {
        "recent_1m": {"loan_approval": 0, "corporate_review": 0},
        "recent_3m": {"loan_approval": 0, "corporate_review": 0},
        "recent_6m": {"loan_approval": 0, "corporate_review": 0},
        "recent_1y": {"loan_approval": 0, "corporate_review": 0},
    }
    entries = []

    # Parse query entries: date + type + institution
    pattern = r"(\d{4}-\d{2}-\d{2})\s+(贷款审批|信用卡审批|法人资格审查|法人审查)\s+(.+?)(?:\n|$)"
    for match in re.finditer(pattern, text):
        date_str = match.group(1)
        query_type = match.group(2)
        institution = match.group(3).strip()

        entry_date = datetime.strptime(date_str, "%Y-%m-%d")
        entries.append({
            "date": date_str,
            "type": query_type,
            "institution": institution,
        })

        # Classify the query type
        is_loan = query_type in ("贷款审批", "信用卡审批")
        is_corporate = query_type in ("法人资格审查", "法人审查")

        # Accumulate into periods (cumulative: 1m is also in 3m, etc.)
        if entry_date >= boundary_1m:
            if is_loan:
                periods["recent_1m"]["loan_approval"] += 1
            if is_corporate:
                periods["recent_1m"]["corporate_review"] += 1
        if entry_date >= boundary_3m:
            if is_loan:
                periods["recent_3m"]["loan_approval"] += 1
            if is_corporate:
                periods["recent_3m"]["corporate_review"] += 1
        if entry_date >= boundary_6m:
            if is_loan:
                periods["recent_6m"]["loan_approval"] += 1
            if is_corporate:
                periods["recent_6m"]["corporate_review"] += 1
        if entry_date >= boundary_1y:
            if is_loan:
                periods["recent_1y"]["loan_approval"] += 1
            if is_corporate:
                periods["recent_1y"]["corporate_review"] += 1

    result = dict(periods)
    result["entries"] = entries
    return result


def extract_credit_data(text: str, reference_date: Optional[str] = None) -> dict:
    """Main entry point: combine all parsers into one result dict.

    Args:
        text: full credit report text
        reference_date: optional reference date (YYYY-MM-DD)

    Returns dict with all extracted credit data fields.
    """
    debt = parse_debt_summary(text)
    card = parse_credit_card_info(text)
    overdue = parse_overdue_records(text)
    queries = parse_query_records(text, reference_date)

    # Convert active_loans to list format for frontend
    active_loans_list = debt["institution_details"]  # already a list of dicts with type+balance

    # Convert overdue_records to list format for frontend
    overdue_list = []
    if overdue.get("current_overdue", 0) > 0:
        overdue_list.append({"type": "当前逾期", "count": overdue["current_overdue"]})
    if overdue.get("historical_overdue", 0) > 0:
        overdue_list.append({"type": "历史逾期", "count": overdue["historical_overdue"]})
    for detail in overdue.get("details", []):
        overdue_list.append({"type": "逾期明细", "date": detail.get("date", ""), "amount": detail.get("amount", 0)})

    # Remove 'entries' from query_records (frontend doesn't need it)
    query_records = {k: v for k, v in queries.items() if k != "entries"}

    return {
        "total_debt": debt["total_debt"],
        "total_balance": debt["total_balance"],
        "institution_details": debt["institution_details"],
        "active_loans": active_loans_list,
        "credit_card_total_limit": card["total_limit"],
        "credit_card_used": card["used"],
        "credit_card_usage_rate": card["usage_rate"],
        "overdue_records": overdue_list,
        "query_records": query_records,
    }


def parse_credit_report_pdf(filepath: str, reference_date: Optional[str] = None) -> dict:
    """Parse a credit report PDF file.

    Uses pdfplumber to extract text, then calls extract_credit_data.

    Args:
        filepath: path to PDF file
        reference_date: optional reference date (YYYY-MM-DD)

    Returns dict with extracted credit data.

    Raises:
        ValueError: if no text could be extracted (e.g. scanned PDF)
    """
    import pdfplumber

    all_text = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                all_text.append(page_text)

    if not all_text:
        raise ValueError(
            "无法从PDF中提取文本，该文件可能是扫描件。请使用OCR功能处理。"
        )

    full_text = "\n".join(all_text)
    return extract_credit_data(full_text, reference_date)
