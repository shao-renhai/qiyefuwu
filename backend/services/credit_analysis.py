"""
征信分析报告生成服务

根据手动录入数据（优先）或 OCR 自动解析数据，生成：
1. 概览指标
2. 负债结构分析
3. 风险预警（带等级）
4. 优化建议（规则驱动文字）
"""

from datetime import datetime, timedelta
from typing import Optional


def _get(manual: Optional[dict], parsed: Optional[dict], key: str, default=None):
    """手动数据优先，parsed 兜底"""
    if manual and key in manual and manual[key] is not None:
        return manual[key]
    if parsed and key in parsed and parsed[key] is not None:
        return parsed[key]
    return default


def _get_institutions(manual: Optional[dict], parsed: Optional[dict]) -> list:
    """获取在贷机构明细"""
    if manual and manual.get("institutions"):
        return manual["institutions"]
    if parsed and parsed.get("institution_details"):
        return parsed["institution_details"]
    return []


def _get_query_records(manual: Optional[dict], parsed: Optional[dict]) -> dict:
    """获取查询记录"""
    if manual and manual.get("query_records"):
        return manual["query_records"]
    if parsed and parsed.get("query_records"):
        return parsed["query_records"]
    return {}


def _get_overdue_records(manual: Optional[dict], parsed: Optional[dict]) -> list:
    """获取逾期记录"""
    if manual and manual.get("overdue_records"):
        return manual["overdue_records"]
    if parsed and parsed.get("overdue_records"):
        return parsed["overdue_records"]
    return []


def build_analysis_report(
    manual_data: Optional[dict],
    parsed_data: Optional[dict],
    client_name: str = "",
) -> dict:
    """生成完整征信分析报告"""

    manual = manual_data or {}
    parsed = parsed_data or {}

    # ── 1. 概览指标 ──────────────────────────────────────────────────

    total_credit_limit = _get(manual, parsed, "total_credit_limit", 0) or 0
    total_balance = _get(manual, parsed, "total_balance", 0) or 0
    # 也检查 total_debt
    if total_balance == 0:
        total_balance = _get(manual, parsed, "total_debt", 0) or 0

    institutions = _get_institutions(manual, parsed)
    institution_count = len(institutions)
    # 如果是汇总模式，可能直接给了 institution_count
    if institution_count == 0:
        institution_count = _get(manual, parsed, "institution_count", 0) or 0

    debt_ratio = round(total_balance / total_credit_limit * 100, 1) if total_credit_limit > 0 else 0

    card_limit = _get(manual, parsed, "credit_card_total_limit", 0) or 0
    # 兼容字段名
    if card_limit == 0:
        cards = manual.get("credit_cards", {}) if manual else {}
        card_limit = cards.get("total_limit", 0) or 0

    card_used = _get(manual, parsed, "credit_card_used", 0) or 0
    if card_used == 0:
        cards = manual.get("credit_cards", {}) if manual else {}
        card_used = cards.get("used", 0) or 0

    card_usage_rate = round(card_used / card_limit * 100, 1) if card_limit > 0 else 0

    # 大额分期
    cards_manual = manual.get("credit_cards", {}) if manual else {}
    installment_count = cards_manual.get("installment_count", 0) or 0
    installment_balance = cards_manual.get("installment_balance", 0) or 0

    query_records = _get_query_records(manual, parsed)
    q_6m = query_records.get("recent_6m", {})
    q_1y = query_records.get("recent_1y", {})
    queries_6m_loan = (q_6m.get("loan_approval", 0) or 0) + (q_6m.get("card_approval", 0) or 0)
    queries_1y_loan = (q_1y.get("loan_approval", 0) or 0) + (q_1y.get("card_approval", 0) or 0)

    overdue_records = _get_overdue_records(manual, parsed)

    overview = {
        "total_credit_limit": total_credit_limit,
        "total_balance": total_balance,
        "debt_ratio": debt_ratio,
        "institution_count": institution_count,
        "card_limit": card_limit,
        "card_used": card_used,
        "card_usage_rate": card_usage_rate,
        "installment_count": installment_count,
        "installment_balance": installment_balance,
        "queries_6m": queries_6m_loan,
        "queries_1y": queries_1y_loan,
        "overdue_count": len(overdue_records),
    }

    # ── 2. 负债结构 ──────────────────────────────────────────────────

    debt_structure = []
    for inst in institutions:
        ptype = inst.get("product_type") or inst.get("type") or "其他"
        balance = inst.get("balance", 0) or 0
        debt_structure.append({
            "institution": inst.get("name") or inst.get("institution") or "未知机构",
            "product_type": ptype,
            "balance": balance,
            "credit_limit": inst.get("credit_limit") or inst.get("original_amount") or 0,
            "monthly_payment": inst.get("monthly_payment", 0) or 0,
            "interest_rate": inst.get("interest_rate", 0) or 0,
            "due_date": inst.get("due_date", ""),
            "status": inst.get("status", "正常"),
        })

    # 按产品类型分组统计
    type_summary = {}
    for d in debt_structure:
        pt = d["product_type"]
        if pt not in type_summary:
            type_summary[pt] = {"count": 0, "balance": 0}
        type_summary[pt]["count"] += 1
        type_summary[pt]["balance"] += d["balance"]

    # 加入信用卡
    if card_used > 0:
        type_summary["信用卡"] = {"count": 1, "balance": card_used}

    # ── 3. 风险预警 ──────────────────────────────────────────────────

    risks = []

    # 在贷机构数
    if institution_count > 6:
        risks.append({
            "level": "high", "category": "多头负债",
            "title": f"在贷机构 {institution_count} 家，超过红线(6家)",
            "detail": "银行审批时多头负债是重要扣分项，严重影响新贷款审批通过率",
        })
    elif institution_count > 4:
        risks.append({
            "level": "medium", "category": "多头负债",
            "title": f"在贷机构 {institution_count} 家，超过警戒线(4家)",
            "detail": "建议优化负债结构，减少机构数量",
        })

    # 负债率
    if debt_ratio > 80:
        risks.append({
            "level": "high", "category": "负债率",
            "title": f"负债率 {debt_ratio}%，超过红线(80%)",
            "detail": "负债率过高，银行可能直接拒贷",
        })
    elif debt_ratio > 60:
        risks.append({
            "level": "medium", "category": "负债率",
            "title": f"负债率 {debt_ratio}%，超过警戒线(60%)",
            "detail": "建议还款降低负债率至60%以下",
        })

    # 信用卡使用率
    if card_usage_rate > 90:
        risks.append({
            "level": "high", "category": "信用卡",
            "title": f"信用卡使用率 {card_usage_rate}%，超过红线(90%)",
            "detail": "极高的使用率在征信上等同于资金紧张信号",
        })
    elif card_usage_rate > 70:
        risks.append({
            "level": "medium", "category": "信用卡",
            "title": f"信用卡使用率 {card_usage_rate}%，超过警戒线(70%)",
            "detail": "建议还款至70%以下，等下期账单更新",
        })

    # 查询次数
    if queries_6m_loan > 8:
        risks.append({
            "level": "high", "category": "查询",
            "title": f"近6个月贷款审批查询 {queries_6m_loan} 次，超过红线(8次)",
            "detail": "频繁查询是银行重点关注指标，会被认为资金紧张",
        })
    elif queries_6m_loan > 4:
        risks.append({
            "level": "medium", "category": "查询",
            "title": f"近6个月贷款审批查询 {queries_6m_loan} 次，超过警戒线(4次)",
            "detail": "建议暂停申贷，等待查询记录自然消退",
        })

    # 逾期
    has_current_overdue = False
    has_cleared_overdue = False
    for ov in overdue_records:
        status = ov.get("status", "")
        if status == "未结清" or ov.get("type") == "当前逾期":
            has_current_overdue = True
        else:
            has_cleared_overdue = True

    if has_current_overdue:
        risks.append({
            "level": "high", "category": "逾期",
            "title": "存在未结清逾期记录",
            "detail": "当前逾期是一票否决项，必须优先处理",
        })
    elif has_cleared_overdue:
        risks.append({
            "level": "medium", "category": "逾期",
            "title": "有历史逾期记录（已结清）",
            "detail": "已结清逾期仍在征信显示，部分银行仅看近2年数据",
        })

    # 大额分期
    if installment_balance > 0:
        risks.append({
            "level": "low", "category": "分期",
            "title": f"信用卡大额分期 {installment_count} 笔，余额 {installment_balance/10000:.1f} 万",
            "detail": "大额分期全额计入负债，影响负债率计算",
        })

    # 即将到期集中
    now = datetime.now()
    soon_due = []
    for d in debt_structure:
        due = d.get("due_date", "")
        if due:
            try:
                due_date = datetime.strptime(due, "%Y-%m") if len(due) == 7 else datetime.strptime(due, "%Y-%m-%d")
                if due_date <= now + timedelta(days=90):
                    soon_due.append(d)
            except (ValueError, TypeError):
                pass

    if len(soon_due) > 3:
        risks.append({
            "level": "high", "category": "到期集中",
            "title": f"3个月内有 {len(soon_due)} 笔贷款到期",
            "detail": "集中到期压力大，需提前准备续贷或还款资金",
        })
    elif len(soon_due) > 1:
        risks.append({
            "level": "medium", "category": "到期集中",
            "title": f"3个月内有 {len(soon_due)} 笔贷款到期",
            "detail": "建议提前2个月启动续贷手续",
        })

    # Sort: high > medium > low
    level_order = {"high": 0, "medium": 1, "low": 2}
    risks.sort(key=lambda r: level_order.get(r["level"], 9))

    # ── 4. 优化建议 ──────────────────────────────────────────────────

    suggestions = []

    # 机构数优化
    if institution_count > 4:
        # 找出余额最小的消费贷建议结清
        consumer_loans = [d for d in debt_structure if d["product_type"] in ("消费贷", "其他贷款", "循环贷", "其他")]
        consumer_loans.sort(key=lambda x: x.get("balance", 0))
        if consumer_loans:
            target = consumer_loans[0]
            bal = target["balance"]
            bal_str = f"{bal/10000:.1f}万" if bal >= 10000 else f"{bal:.0f}元"
            suggestions.append({
                "category": "降机构数",
                "action": f"优先结清「{target['institution']}」{target['product_type']}（余额 {bal_str}），"
                          f"将在贷机构从 {institution_count} 家降至 {institution_count - 1} 家",
                "priority": "high" if institution_count > 6 else "medium",
            })

    # 信用卡使用率优化
    if card_usage_rate > 70:
        need_pay = card_used - card_limit * 0.7
        need_str = f"{need_pay/10000:.1f}万" if need_pay >= 10000 else f"{need_pay:.0f}元"
        suggestions.append({
            "category": "降信用卡使用率",
            "action": f"还款约 {need_str} 将使用率从 {card_usage_rate}% 降至 70% 以下，"
                      "等下期账单日更新征信（约1个月生效）",
            "priority": "high" if card_usage_rate > 90 else "medium",
        })

    # 查询过多
    if queries_6m_loan > 4:
        # 估算需要等多久：查询记录按6个月窗口，最早的查询落出窗口即可
        wait_months = max(1, 6 - queries_6m_loan // 2)
        suggestions.append({
            "category": "等查询消退",
            "action": f"近6个月查询 {queries_6m_loan} 次，建议停止申贷，"
                      f"等待约 {wait_months} 个月后查询降至安全线以下再操作",
            "priority": "high" if queries_6m_loan > 8 else "medium",
        })

    # 逾期处理
    if has_current_overdue:
        suggestions.append({
            "category": "处理逾期",
            "action": "立即还清所有逾期欠款，还清后等1个月征信更新，再进行贷款申请",
            "priority": "high",
        })

    # 到期续贷
    for d in soon_due:
        suggestions.append({
            "category": "续贷准备",
            "action": f"「{d['institution']}」{d['product_type']}将于 {d['due_date']} 到期，"
                      "建议提前2个月启动续贷手续，准备好经营材料",
            "priority": "medium",
        })

    # 负债率优化
    if debt_ratio > 60 and not any(s["category"] == "降机构数" for s in suggestions):
        need_reduce = total_balance - total_credit_limit * 0.6
        need_str = f"{need_reduce/10000:.1f}万" if need_reduce >= 10000 else f"{need_reduce:.0f}元"
        suggestions.append({
            "category": "降负债率",
            "action": f"需还款约 {need_str} 将负债率从 {debt_ratio}% 降至 60% 以下",
            "priority": "high" if debt_ratio > 80 else "medium",
        })

    # ── 5. 数据来源标识 ──────────────────────────────────────────────

    data_source = "manual" if manual_data else ("auto" if parsed_data else "none")

    return {
        "client_name": client_name,
        "data_source": data_source,
        "overview": overview,
        "debt_structure": debt_structure,
        "type_summary": type_summary,
        "query_records": query_records,
        "overdue_records": overdue_records,
        "risks": risks,
        "risk_summary": {
            "high": len([r for r in risks if r["level"] == "high"]),
            "medium": len([r for r in risks if r["level"] == "medium"]),
            "low": len([r for r in risks if r["level"] == "low"]),
        },
        "suggestions": suggestions,
        "generated_at": datetime.now().isoformat(),
    }
