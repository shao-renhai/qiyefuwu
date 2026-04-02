"""
Credit report parser for Chinese PBOC credit reports.

Extracts structured data from credit report text including debt summaries,
credit card info, overdue records, and query records.
Supports two formats:
  1. Detailed (扫描件/OCR) - table-based with headers like 授信总额, 余额
  2. Simplified (电子版简版) - natural language descriptions
"""

import re
from datetime import datetime, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

def _extract_amount(text: str) -> float:
    """Extract numeric amount from text like '85万', '23.5万', '1000元', '50000'.

    Also handles comma-separated numbers like '2,000,000'.
    """
    m = re.search(r"([\d,]+\.?\d*)\s*万", text)
    if m:
        return float(m.group(1).replace(",", "")) * 10000

    m = re.search(r"([\d,]+\.?\d*)\s*元", text)
    if m:
        return float(m.group(1).replace(",", ""))

    m = re.search(r"([\d,]+\.?\d*)", text)
    if m:
        val = m.group(1).replace(",", "")
        if val:
            return float(val)

    return 0.0


def _find_numbers(text: str) -> list[float]:
    """Extract all numbers (with commas) from a text string."""
    matches = re.findall(r"[\d,]+\.?\d*", text)
    results = []
    for m in matches:
        val = m.replace(",", "")
        if val and val != ".":
            try:
                results.append(float(val))
            except ValueError:
                pass
    return results


def _is_simplified_format(text: str) -> bool:
    """Detect if text is from a simplified (电子版) credit report.

    Simplified reports use natural language like:
      "发放的550,000元（人民币）个人住房商业贷款"
      "信用额度33,000，已使用额度27,606"
    Detailed reports use table headers like:
      "授信总额  余额  循环贷账户信息汇总"
    """
    simplified_markers = [
        "从未逾期过的贷记卡",
        "从未发生过逾期的账户",
        "发生过逾期的账户数",
        "未结清/未销户账户数",
        "这部分包含您的信用卡、贷款",
        "发放的贷记卡",
        "已使用额度",
        "信用额度",
    ]
    detailed_markers = [
        "循环贷账户",
        "授信总额",
        "信贷交易授信及负债信息概要",
        "贷记卡账户信息汇总",
    ]
    s_score = sum(1 for m in simplified_markers if m in text)
    d_score = sum(1 for m in detailed_markers if m in text)
    return s_score > d_score


# ---------------------------------------------------------------------------
# Simplified format parser (电子版)
# ---------------------------------------------------------------------------

def _parse_simplified_credit_cards(text: str) -> dict:
    """Parse credit card info from simplified report.

    Patterns (note: line breaks may split keywords like 信\n用额度):
      "信用额度33,000，已使用额度27,606"
      "信用额度50,000元（人民币），已使用额度0"
    """
    total_limit = 0.0
    total_used = 0.0

    # Normalize: collapse newlines within credit card entries so regex can match
    # "信\n用额度" → "信用额度"
    normalized = re.sub(r"信\s*\n\s*用额度", "信用额度", text)
    # Also normalize "截\n至" → "截至" etc.
    normalized = re.sub(r"截\s*\n\s*至", "截至", normalized)

    # Find all credit card entries (贷记卡)
    # The text may have 。between card description and amount:
    # "发放的贷记卡（...）。截至2026年02月，信用额度33,000，已使用额度27,606。"
    # So we use .{0,200}? to allow crossing sentence boundaries
    card_pattern = (
        r"发放的贷记卡.{0,200}?信用额度\s*([\d,]+).{0,50}?已使用额度\s*([\d,]+)"
    )
    for m in re.finditer(card_pattern, normalized, re.DOTALL):
        limit = float(m.group(1).replace(",", ""))
        used = float(m.group(2).replace(",", ""))
        total_limit += limit
        total_used += used

    usage_rate = (total_used / total_limit * 100) if total_limit > 0 else 0.0

    return {
        "total_limit": total_limit,
        "used": total_used,
        "usage_rate": round(usage_rate, 1),
    }


def _parse_simplified_loans(text: str) -> dict:
    """Parse loan info from simplified report.

    Patterns:
      "发放的550,000元（人民币）个人住房商业贷款...余额539,724"
      "授信，额度长期有效...信用额度5,800元（人民币），余额为0"
      "发放的1,240元（人民币）其他个人消费贷款，2024年01月已结清"
    """
    institution_details = []
    total_balance = 0.0

    # --- Housing loans ---
    # Note: text may have 。between loan description and balance
    # "发放的550,000元（人民币）个人住房商业贷款，2055年03月17日到期。\n截至2026年02月，余额539,724。"
    housing_pattern = (
        r"发放的\s*([\d,]+)\s*元.{0,100}?个人住房.{0,100}?贷款.{0,200}?"
        r"余额\s*([\d,]+)"
    )
    for m in re.finditer(housing_pattern, text, re.DOTALL):
        amount = float(m.group(1).replace(",", ""))
        balance = float(m.group(2).replace(",", ""))
        institution_details.append({
            "type": "住房贷款",
            "count": 1,
            "balance": balance,
            "original_amount": amount,
        })
        total_balance += balance

    # --- Active (non-housing) loans with balance ---
    # Pattern: "发放的X元...贷款...余额Y" (not housing, not settled)
    other_loan_pattern = (
        r"发放的\s*([\d,]+)\s*元.{0,100}?(?:消费|经营|其他).{0,100}?贷款.{0,200}?"
        r"余额\s*([\d,]+)"
    )
    for m in re.finditer(other_loan_pattern, text, re.DOTALL):
        full_match = m.group(0)
        if "住房" in full_match:
            continue  # skip housing loans (already handled)
        if "已结清" in full_match:
            continue
        amount = float(m.group(1).replace(",", ""))
        balance = float(m.group(2).replace(",", ""))
        if balance > 0:
            institution_details.append({
                "type": "其他贷款",
                "count": 1,
                "balance": balance,
            })
            total_balance += balance

    # --- Revolving credit lines with balance ---
    # Normalize line breaks within "信用额度" for revolving entries too
    normalized = re.sub(r"信用额度\s*\n\s*", "信用额度", text)
    # Pattern: "授信...消费贷款授信...信用额度X元...余额为Y"
    revolving_pattern = (
        r"(?:授信|为)[^。]*?(?:消费|经营)[^。]*?"
        r"信用额度\s*([\d,]+)\s*元[^。]*?"
        r"余额[为是]?\s*([\d,]+)"
    )
    for m in re.finditer(revolving_pattern, normalized, re.DOTALL):
        full_match = m.group(0)
        if "已结清" in full_match:
            continue
        limit = float(m.group(1).replace(",", ""))
        balance = float(m.group(2).replace(",", ""))
        if balance > 0:
            institution_details.append({
                "type": "循环贷",
                "count": 1,
                "balance": balance,
            })
            total_balance += balance

    # --- Count settled loans ---
    settled_count = len(re.findall(r"已结清", text))

    active_count = sum(d.get("count", 1) for d in institution_details)

    return {
        "total_debt": total_balance,
        "total_balance": total_balance,
        "institution_details": institution_details,
        "active_loans": active_count,
        "settled_count": settled_count,
    }


def _parse_simplified_overdue(text: str) -> dict:
    """Parse overdue info from simplified report."""
    current = 0
    historical = 0
    details = []

    # "发生过逾期的账户数 -- -- -- --" means no overdue
    # "发生过逾期的账户数 1 2 3 --" means has overdue
    m = re.search(
        r"发生过逾期的账户数\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)",
        text,
    )
    if m:
        for g in m.groups():
            if g != "--" and g.isdigit() and int(g) > 0:
                historical = max(historical, int(g))

    m = re.search(
        r"发生过90天以上逾期的账户数\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)\s+([\d-]+)",
        text,
    )
    if m:
        for g in m.groups():
            if g != "--" and g.isdigit() and int(g) > 0:
                current = max(current, int(g))

    # Look for "逾期" + "未按时还" in narrative
    if re.search(r"发生过逾期的账户明细", text):
        overdue_entries = re.findall(
            r"(\d{4}年\d{2}月\d{2}日)[^。]*?逾期[^。]*?([\d,]+)",
            text,
        )
        for date_str, amount_str in overdue_entries:
            historical += 1
            details.append({
                "date": date_str,
                "amount": float(amount_str.replace(",", "")),
            })

    return {
        "current_overdue": current,
        "historical_overdue": historical,
        "details": details,
    }


def _parse_simplified_queries(text: str, reference_date: Optional[str] = None) -> dict:
    """Parse query records from simplified report.

    Pattern: "N YYYY年MM月DD日 机构名 查询原因"
    The 查询原因 may wrap to next line.
    """
    if reference_date:
        ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    else:
        ref_date = datetime.now()

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

    # Find query section
    section_match = re.search(r"机构查询记录明细", text)
    if not section_match:
        return {**periods, "entries": [], "total_post_loan": 0}

    # End at "个人查询记录" or end of text
    end_match = re.search(r"个人查询记录明细", text[section_match.end():])
    if end_match:
        search_text = text[section_match.end():section_match.end() + end_match.start()]
    else:
        search_text = text[section_match.end():]

    # Query types
    query_types = (
        r"信用卡审批|贷款审批|贷后管理|融资审批|担保资格审查|资信审查|"
        r"法人资格审查|法人审查|保前审查"
    )

    # Pattern: "N YYYY年MM月DD日 机构名 查询原因"
    # Note: institution name may wrap to next line, but query reason is on same line
    # Example: "1 2026年03月15日 中国建设银行股份有限公司茂名市 信用卡审批"
    #          "分行"  (continuation of institution name, on next line)
    pattern = rf"(\d{{4}}年\d{{2}}月\d{{2}}日)\s+(.+?)\s+({query_types})"
    for m in re.finditer(pattern, search_text):
        date_cn = m.group(1)
        institution = m.group(2).strip().replace("\n", "")
        query_type = m.group(3)

        # Convert Chinese date to datetime
        date_match = re.match(r"(\d{4})年(\d{2})月(\d{2})日", date_cn)
        if not date_match:
            continue
        y, mo, d = int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3))
        try:
            entry_date = datetime(y, mo, d)
        except ValueError:
            continue

        date_str = f"{y:04d}-{mo:02d}-{d:02d}"

        entries.append({
            "date": date_str,
            "type": query_type,
            "institution": institution,
        })

        is_loan = query_type in ("贷款审批", "信用卡审批", "融资审批")
        is_corporate = query_type in ("法人资格审查", "法人审查", "担保资格审查", "资信审查")

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

    total_post_loan = sum(1 for e in entries if e["type"] == "贷后管理")

    result = dict(periods)
    result["entries"] = entries
    result["total_post_loan"] = total_post_loan
    return result


def extract_simplified_credit_data(text: str, reference_date: Optional[str] = None) -> dict:
    """Parse simplified (电子版) credit report."""
    loans = _parse_simplified_loans(text)
    cards = _parse_simplified_credit_cards(text)
    overdue = _parse_simplified_overdue(text)
    queries = _parse_simplified_queries(text, reference_date)

    active_loans_list = loans["institution_details"]

    overdue_list = []
    if overdue.get("current_overdue", 0) > 0:
        overdue_list.append({"type": "当前逾期", "count": overdue["current_overdue"]})
    if overdue.get("historical_overdue", 0) > 0:
        overdue_list.append({"type": "历史逾期", "count": overdue["historical_overdue"]})
    for detail in overdue.get("details", []):
        overdue_list.append({"type": "逾期明细", "date": detail.get("date", ""), "amount": detail.get("amount", 0)})

    query_records = {k: v for k, v in queries.items() if k != "entries"}

    return {
        "total_debt": loans["total_debt"],
        "total_balance": loans["total_balance"],
        "institution_details": loans["institution_details"],
        "active_loans": active_loans_list,
        "credit_card_total_limit": cards["total_limit"],
        "credit_card_used": cards["used"],
        "credit_card_usage_rate": cards["usage_rate"],
        "overdue_records": overdue_list,
        "query_records": query_records,
    }


# ---------------------------------------------------------------------------
# Detailed format parser (扫描件/OCR)
# ---------------------------------------------------------------------------

def parse_debt_summary(text: str) -> dict:
    """Parse debt section from detailed credit report text."""
    institution_details = []
    total_balance = 0.0

    revolving1 = re.search(
        r"循环贷账户.{0,3}信息汇总([\s\S]{0,300}?)循环贷账户二",
        text,
    )
    if revolving1:
        section = revolving1.group(1)
        numbers = _find_numbers(section)
        big_numbers = [n for n in numbers if n >= 1000]
        if big_numbers:
            credit_total = big_numbers[0]
            bal_match = re.search(r"余[额扰][^\d]{0,20}([\d,]+\.?\d*)", section)
            if bal_match:
                balance = float(bal_match.group(1).replace(",", ""))
            elif len(big_numbers) >= 2:
                balance = big_numbers[1]
            else:
                balance = 0
            if balance > 0 and balance != credit_total:
                institution_details.append({
                    "type": "循环贷",
                    "count": 1,
                    "balance": balance,
                })
                total_balance += balance

    revolving2 = re.search(
        r"循环贷账户二.{0,10}信息汇总([\s\S]{0,400}?)(?:仿.?卡|贷记卡|信用卡|开立)",
        text,
    )
    if revolving2:
        section = revolving2.group(1)
        numbers = _find_numbers(section)
        big_numbers = [n for n in numbers if n >= 100]
        if len(big_numbers) >= 3:
            credit_total = big_numbers[0]
            balance = big_numbers[1]
            small_numbers = [n for n in numbers if n < 100]
            count = int(small_numbers[1]) if len(small_numbers) >= 2 else 1
            if balance > 0:
                institution_details.append({
                    "type": "循环贷",
                    "count": count,
                    "balance": balance,
                })
                total_balance += balance

    non_revolving = re.search(
        r"非循环贷.{0,10}信息汇总([\s\S]{0,300}?)(?:循环贷|贷记卡|信用卡)",
        text,
    )
    if non_revolving:
        section = non_revolving.group(1)
        numbers = _find_numbers(section)
        if len(numbers) >= 3:
            balance = numbers[-2] if len(numbers) >= 3 else 0
            if balance > 0:
                institution_details.append({
                    "type": "非循环贷",
                    "count": 1,
                    "balance": balance,
                })
                total_balance += balance

    loan_types = ["住房贷款", "商用房贷款", "其他贷款", "消费贷", "经营贷"]
    for loan_type in loan_types:
        pattern = rf"(?:个人)?{re.escape(loan_type)}[^\n]*"
        match = re.search(pattern, text)
        if match:
            line = match.group(0)
            bal_match = re.search(r"余额\s*([\d,.]+\s*万?元?)", line)
            balance = _extract_amount(bal_match.group(1)) if bal_match else 0.0
            count_match = re.search(r"笔数?\s*(\d+)", line)
            count = int(count_match.group(1)) if count_match else 1
            if balance > 0 or count_match:
                already = any(d["type"] == loan_type for d in institution_details)
                if not already:
                    institution_details.append({
                        "type": loan_type,
                        "count": count,
                        "balance": balance,
                    })
                    total_balance += balance

    active_loans = sum(d.get("count", 1) for d in institution_details)

    return {
        "total_debt": total_balance,
        "total_balance": total_balance,
        "institution_details": institution_details,
        "active_loans": active_loans,
    }


def parse_credit_card_info(text: str) -> dict:
    """Extract credit card information from detailed report."""
    total_limit = 0.0
    used = 0.0

    limit_match = re.search(r"授信总额\s*([\d,.]+\s*万?元?)", text)
    if limit_match:
        total_limit = _extract_amount(limit_match.group(1))

    used_match = re.search(r"已用额度\s*([\d,.]+\s*万?元?)", text)
    if used_match:
        used = _extract_amount(used_match.group(1))

    if total_limit == 0:
        card_section = re.search(
            r"(?:仿.?卡|贷记卡|信用卡).{0,10}(?:账户|账P).{0,10}(?:信息|倍息)?汇总([\s\S]{0,400}?)(?:三信贷|信贷交易信息|非循环贷|开立|重庆|业务种类)",
            text,
        )
        if card_section:
            section = card_section.group(1)
            numbers = _find_numbers(section)
            if len(numbers) >= 7:
                total_limit = numbers[2]
                used = numbers[5]
            elif len(numbers) >= 3:
                total_limit = numbers[2] if len(numbers) > 2 else 0
                used = numbers[-2] if len(numbers) >= 4 else 0

    usage_rate = (used / total_limit * 100) if total_limit > 0 else 0.0

    return {
        "total_limit": total_limit,
        "used": used,
        "usage_rate": round(usage_rate, 1),
    }


def parse_overdue_records(text: str) -> dict:
    """Parse overdue record counts from detailed report."""
    current = 0
    historical = 0
    details = []

    m = re.search(r"当前逾期\s*(\d+)\s*笔", text)
    if m:
        current = int(m.group(1))

    m = re.search(r"历史逾期\s*(\d+)\s*笔", text)
    if m:
        historical = int(m.group(1))

    overdue_periods = re.findall(r"当前逾期期数\s*\n?\s*(\d+)", text)
    for period in overdue_periods:
        if int(period) > 0:
            current = max(current, int(period))

    detail_pattern = r"(\d{4}[-/.]\d{2}[-/.]\d{2})\s+逾期.*?([\d,.]+\s*万?元?)"
    for match in re.finditer(detail_pattern, text):
        details.append({
            "date": match.group(1),
            "amount": _extract_amount(match.group(2)),
        })

    overdue_months = re.findall(r"逾期月[数至]\s*\n?\s*(\d+)", text)
    for m in overdue_months:
        if int(m) > 0:
            historical = max(historical, 1)

    return {
        "current_overdue": current,
        "historical_overdue": historical,
        "details": details,
    }


def parse_query_records(text: str, reference_date: Optional[str] = None) -> dict:
    """Parse query records from detailed (OCR) report."""
    if reference_date:
        ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    else:
        ref_date = datetime.now()

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

    loan_approval_synonyms = r"贷款审批|贷款中批|贷款中此|贷款刘批|贷款刘扯|贷款让手|贷款让扯|贷耸市批|货款审批|货效审批|货款昌丝|货雪站批|贷赤审批|贷孝审批|贷元宙批|贷于站批|信用卡审批|侨天审批"
    post_loan_synonyms = r"贷后管理|贷后答理|贷后宕理|贷后窟理|贷后过理|货后答理|货后管理|仙后宕理|贷后理"
    corporate_synonyms = r"法人资格审查|法人审查|担保资格审查|担保次格审查|坦保次格审查|资信审查|资信查"
    all_query_types = f"{loan_approval_synonyms}|{post_loan_synonyms}|{corporate_synonyms}"

    query_section_match = re.search(r"(?:机构查询记录|查询记录).{0,10}明细", text)
    search_text = text[query_section_match.start():] if query_section_match else text

    patterns = [
        rf"(\d{{4}}-\d{{2}}-\d{{2}})\s+({all_query_types})\s+(.+?)(?:\n|$)",
        rf"(?:^|\n)\s*\d+\s+(\d{{4}}\.\d{{2}}[.\-]\d{{2}})\s+.{{0,80}}?({all_query_types})",
        rf"(\d{{4}}\.\d{{2}}\.\d{{2}})\s+.{{0,100}}?({all_query_types})",
        rf"(\d{{4}}\.\d{{2}}[.\-]\d{{2}}).{{0,60}}?({all_query_types})",
    ]

    seen_entries = set()

    for pattern in patterns:
        for match in re.finditer(pattern, search_text):
            date_str = match.group(1)
            query_type_raw = match.group(2)

            date_str_normalized = date_str.replace(".", "-")
            date_str_normalized = re.sub(r"-+", "-", date_str_normalized)

            try:
                entry_date = datetime.strptime(date_str_normalized, "%Y-%m-%d")
            except ValueError:
                continue

            if re.search(loan_approval_synonyms, query_type_raw):
                if "信用卡" in query_type_raw:
                    query_type = "信用卡审批"
                else:
                    query_type = "贷款审批"
            elif re.search(post_loan_synonyms, query_type_raw):
                query_type = "贷后管理"
            elif re.search(corporate_synonyms, query_type_raw):
                query_type = "法人审查"
            else:
                query_type = query_type_raw

            entry_key = (date_str_normalized, query_type)
            if entry_key in seen_entries:
                continue
            seen_entries.add(entry_key)

            institution = match.group(3).strip() if match.lastindex >= 3 else ""
            entries.append({
                "date": date_str_normalized,
                "type": query_type,
                "institution": institution,
            })

            is_loan = query_type in ("贷款审批", "信用卡审批")
            is_corporate = query_type == "法人审查"

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

    if query_section_match:
        loan_count = len(re.findall(loan_approval_synonyms, search_text))
        post_loan_count = len(re.findall(post_loan_synonyms, search_text))
        corporate_count = len(re.findall(corporate_synonyms, search_text))

        dated_loan = sum(1 for e in entries if e["type"] in ("贷款审批", "信用卡审批"))
        if loan_count > dated_loan:
            periods["recent_1y"]["loan_approval"] = max(
                periods["recent_1y"]["loan_approval"], loan_count
            )
        dated_corporate = sum(1 for e in entries if e["type"] == "法人审查")
        if corporate_count > dated_corporate:
            periods["recent_1y"]["corporate_review"] = max(
                periods["recent_1y"]["corporate_review"], corporate_count
            )

    result = dict(periods)
    result["entries"] = entries
    result["total_post_loan"] = len(re.findall(post_loan_synonyms, search_text)) if query_section_match else 0
    return result


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def extract_credit_data(text: str, reference_date: Optional[str] = None) -> dict:
    """Main entry point: auto-detect format and parse.

    Detects whether the text is from a simplified (电子版) or detailed (扫描件)
    credit report, then dispatches to the appropriate parser.
    """
    if _is_simplified_format(text):
        return extract_simplified_credit_data(text, reference_date)

    # Detailed format (OCR / scanned)
    debt = parse_debt_summary(text)
    card = parse_credit_card_info(text)
    overdue = parse_overdue_records(text)
    queries = parse_query_records(text, reference_date)

    active_loans_list = debt["institution_details"]

    overdue_list = []
    if overdue.get("current_overdue", 0) > 0:
        overdue_list.append({"type": "当前逾期", "count": overdue["current_overdue"]})
    if overdue.get("historical_overdue", 0) > 0:
        overdue_list.append({"type": "历史逾期", "count": overdue["historical_overdue"]})
    for detail in overdue.get("details", []):
        overdue_list.append({"type": "逾期明细", "date": detail.get("date", ""), "amount": detail.get("amount", 0)})

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

    Uses pdfplumber to extract text, auto-detects format, then parses.
    Raises ValueError if no text could be extracted (scanned PDF).
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
