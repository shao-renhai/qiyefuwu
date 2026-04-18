"""
流水合并分析 + 诊断引擎（阶段 A）

职责：
1. 合并同一客户下所有 BankStatement 的交易明细，重新去重 + 聚合
2. 计算三大健康比率（覆盖率 / 平衡率 / 波动系数）
3. 根据可配置 RULES 产出 risks + suggestions
4. 组装客户级诊断报告

后续阶段（B / C）可复用此模块：
- 阶段 B：在 compute_income_quality() 中加集中度、回款周期
- 阶段 C：在 detect_laundering() 中加爆发、集中归集、自循环
"""

import copy
import statistics
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from db.database import BankStatement, Client, CreditReport, BankAnalysisContext
from services.analyzer import analyze_bank_statement, mark_duplicates


# ─── 阈值配置（业内常见取值，后续基于案例库校准）────────────────────
THRESHOLDS = {
    "coverage":  {"healthy": 2.0, "warn": 1.5},     # 月均流入 / 月均月供（higher_better）
    "balance":   {"healthy": 0.20, "warn": 0.10},   # 月均净流入 / 月均流入（higher_better）
    "volatility": {"healthy": 0.30, "warn": 0.50},  # std/mean（lower_better）
    "low_balance": {"healthy": 0.10, "warn": 0.05}, # 最低余额 / 月均流入（higher_better）

    # ── 新增：贷款覆盖率（反转后的语义：目标贷款 / 年营业额，lower_better）──
    "loan_coverage": {
        "healthy": 0.30,          # ≤30% 健康
        "warn":    0.80,          # 30–80% 警戒；>80% 高风险
        "unit_mismatch": 0.001,   # <0.1% 触发"金额单位核对"提示
    },

    # ── 新增：体量段位（按业务性年营业额，单位：元）──
    "size_tier": {
        "micro":  500_000,        # < 50 万
        "small":  5_000_000,      # 50 万 – 500 万
        "medium": 30_000_000,     # 500 万 – 3000 万
        "large":  100_000_000,    # 3000 万 – 1 亿
        # > 1 亿 = xlarge
    },

    # ── 新增：数据窗口不足提示（严格小于边界值时触发）──
    "window_adequacy": {
        "warn_below_months":   12,   # window < 12 → low 级（6–11 月）
        "severe_below_months":  6,   # window < 6  → 升级 medium
    },

    # ── Deprecated：旧字段，保留一个版本避免外部代码直接崩──
    # 新代码不要再读这个 key；下一次迭代删除
    "loan_ratio": {"healthy": 0.10, "warn": 0.05},
}


# ─── 合并流水 ──────────────────────────────────────────────────────────

def _resolve_account_holders(client: Client, context: Optional[BankAnalysisContext]) -> List[str]:
    """返回本人 + 公司 + 关联方名单，用于识别"自身转账"。"""
    holders = []
    if client.name:
        holders.append(client.name)
    if client.company_name:
        holders.append(client.company_name)
    if context and context.related_parties:
        holders.extend([str(p) for p in context.related_parties if p])
    return holders


def _mark_duplicates_multi(transactions: List[dict], holders: List[str]) -> List[dict]:
    """扩展 analyzer.mark_duplicates：同名对手方若命中 holders 中任一个，即视为自身/关联转账。"""
    result = copy.deepcopy(transactions)
    from services.analyzer import WITHDRAWAL_KEYWORDS

    holder_set = {h for h in holders if h}

    for tx in result:
        tx.setdefault("is_duplicate", False)
        tx.setdefault("duplicate_reason", "")

        cp = tx.get("counterparty", "")
        if cp and cp in holder_set:
            tx["is_duplicate"] = True
            tx["duplicate_reason"] = f"自身/关联转账（对手方：{cp}）"
            continue
        for kw in WITHDRAWAL_KEYWORDS:
            if kw in tx.get("description", ""):
                tx["is_duplicate"] = True
                tx["duplicate_reason"] = f"提现交易（{kw}）"
                break
    return result


def merge_client_transactions(
    client: Client,
    statements: List[BankStatement],
    context: Optional[BankAnalysisContext],
) -> Dict[str, Any]:
    """
    合并一个客户的所有 BankStatement.raw_data，按日期排序后整体去重 + 分析。

    返回结构与 analyzer.analyze_bank_statement 一致，额外带:
      - account_count: 合并的账户数
      - banks: 涉及的银行清单
    """
    all_txns: List[dict] = []
    banks = set()
    for st in statements:
        raw = st.raw_data or []
        if not isinstance(raw, list):
            continue
        all_txns.extend(raw)
        if st.bank_name:
            banks.add(st.bank_name)

    if not all_txns:
        from services.analyzer import _empty_result
        result = _empty_result()
        result["account_count"] = len(statements)
        result["banks"] = sorted(banks)
        return result

    # 跨账户的"自身/关联转账"去重
    holders = _resolve_account_holders(client, context)
    tagged = _mark_duplicates_multi(all_txns, holders)

    # 排序后交给 analyzer 跑完整聚合；传 "" 作为 holder 跳过重复标注
    tagged.sort(key=lambda t: t.get("date", ""))
    # analyzer.analyze_bank_statement 会再调一次 mark_duplicates，
    # 传入 holders[0] 或空串避免重复标注
    base_holder = holders[0] if holders else ""
    analysis = analyze_bank_statement(tagged, base_holder)
    analysis["account_count"] = len(statements)
    analysis["banks"] = sorted(banks)
    return analysis


# ─── 年营业额总览 ────────────────────────────────────────────────

def _classify_size_tier(annual_revenue: float) -> tuple[str, str]:
    """Return (tier_code, tier_label) based on business-only annual revenue."""
    t = THRESHOLDS["size_tier"]
    if annual_revenue < t["micro"]:
        return "micro", "微型（< 50 万）"
    if annual_revenue < t["small"]:
        return "small", "小型（50 万 – 500 万）"
    if annual_revenue < t["medium"]:
        return "medium", "中型（500 万 – 3000 万）"
    if annual_revenue < t["large"]:
        return "large", "大型（3000 万 – 1 亿）"
    return "xlarge", "特大型（> 1 亿）"


def compute_annual_overview(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute annual revenue and size tier from analysis["monthly_summary"].
    Rules per spec §3, §6.1.

    Return fields:
      window_months / window_start / window_end
      annual_revenue / annual_revenue_raw / self_transfer_amount / self_transfer_ratio
      monthly_avg_income
      size_tier / size_tier_label
      is_annualized / annualized_hint
      full_window_months / full_window_revenue
    """
    monthly = analysis.get("monthly_summary") or []
    full_window_months = len(monthly)

    # Zero-flow fast-path
    if full_window_months == 0:
        tier, label = _classify_size_tier(0)
        return {
            "window_months": 0,
            "window_start": None,
            "window_end": None,
            "annual_revenue": 0,
            "annual_revenue_raw": 0,
            "self_transfer_amount": 0,
            "self_transfer_ratio": 0.0,
            "monthly_avg_income": 0,
            "size_tier": tier,
            "size_tier_label": label,
            "is_annualized": False,
            "annualized_hint": None,
            "full_window_months": 0,
            "full_window_revenue": 0,
        }

    # Sort ascending to take "most recent N"
    sorted_monthly = sorted(monthly, key=lambda m: m.get("month", ""))

    # Take min(12, len) as the computation window
    window_n = min(12, full_window_months)
    window = sorted_monthly[-window_n:]

    def _safe_sum(key, rows):
        return sum(float(r.get(key) or 0) for r in rows)

    annual_revenue = _safe_sum("deduped_income", window)
    annual_revenue_raw = _safe_sum("income", window)
    # Defensive: fallback to income if deduped_income absent (shouldn't happen post-Task 1)
    if annual_revenue == 0 and annual_revenue_raw > 0 and not any("deduped_income" in r for r in window):
        annual_revenue = annual_revenue_raw

    self_transfer_amount = max(0, annual_revenue_raw - annual_revenue)
    self_transfer_ratio = (
        round(self_transfer_amount / annual_revenue_raw, 3)
        if annual_revenue_raw > 0 else 0.0
    )

    # Monthly avg: window >= 12 → /12, else /window_n
    monthly_avg_income = annual_revenue / (12 if window_n >= 12 else window_n)

    is_annualized = window_n < 12
    annualized_hint = None
    if is_annualized and window_n > 0:
        annualized = annual_revenue * 12 / window_n
        annualized_hint = f"≈ 年化 ¥{annualized:,.0f}（×{12/window_n:.1f} 估算）"

    tier, label = _classify_size_tier(annual_revenue)

    full_window_revenue = _safe_sum("deduped_income", sorted_monthly)

    return {
        "window_months": window_n,
        "window_start": window[0]["month"],
        "window_end": window[-1]["month"],
        "annual_revenue": round(annual_revenue, 2),
        "annual_revenue_raw": round(annual_revenue_raw, 2),
        "self_transfer_amount": round(self_transfer_amount, 2),
        "self_transfer_ratio": self_transfer_ratio,
        "monthly_avg_income": round(monthly_avg_income, 2),
        "size_tier": tier,
        "size_tier_label": label,
        "is_annualized": is_annualized,
        "annualized_hint": annualized_hint,
        "full_window_months": full_window_months,
        "full_window_revenue": round(full_window_revenue, 2),
    }


# ─── 三大比率 ─────────────────────────────────────────────────────────

def compute_ratios(analysis: Dict[str, Any], context: Optional[BankAnalysisContext]) -> Dict[str, Any]:
    """
    返回：
      coverage_ratio     流水覆盖率 = 月均净流入(去重) / 月均月供
      balance_ratio      收支平衡率 = 月均净流入 / 月均流入
      volatility_coef    流水波动系数 = std(月流入) / mean(月流入)
      low_balance_ratio  最低余额 / 月均流入
      loan_cover_ratio   月均流水 / 目标贷款金额
    字段值可能为 None（缺乏输入时），前端需容错。
    """
    monthly_avg_income = float(analysis.get("deduped_monthly_avg_income") or 0)
    monthly_avg_net = monthly_avg_income - float(analysis.get("deduped_monthly_avg_expense") or 0)
    min_balance = float(analysis.get("min_balance") or 0)

    ratios: Dict[str, Any] = {
        "coverage_ratio": None,
        "balance_ratio": None,
        "volatility_coef": None,
        "low_balance_ratio": None,
        "loan_cover_ratio": None,
    }

    if context and context.existing_monthly_payment and context.existing_monthly_payment > 0:
        ratios["coverage_ratio"] = round(monthly_avg_income / context.existing_monthly_payment, 2)

    if monthly_avg_income > 0:
        ratios["balance_ratio"] = round(monthly_avg_net / monthly_avg_income, 3)
        ratios["low_balance_ratio"] = round(min_balance / monthly_avg_income, 3)

    # 波动系数：看月度流入序列
    monthly_incomes = [float(m.get("income") or 0) for m in analysis.get("monthly_summary", [])]
    if len(monthly_incomes) >= 2 and statistics.mean(monthly_incomes) > 0:
        ratios["volatility_coef"] = round(
            statistics.pstdev(monthly_incomes) / statistics.mean(monthly_incomes), 3
        )

    if context and context.target_loan_amount and context.target_loan_amount > 0:
        ratios["loan_cover_ratio"] = round(monthly_avg_income / context.target_loan_amount, 3)

    return ratios


# ─── 规则引擎（可配置）────────────────────────────────────────────────

def _level_for(value: float, thr: Dict[str, float], direction: str) -> str:
    """
    direction="higher_better": value >= healthy → low(无风险) / >= warn → medium / else → high
    direction="lower_better": value <= healthy → low / <= warn → medium / else → high
    """
    if direction == "higher_better":
        if value >= thr["healthy"]:
            return "low"
        if value >= thr["warn"]:
            return "medium"
        return "high"
    else:
        if value <= thr["healthy"]:
            return "low"
        if value <= thr["warn"]:
            return "medium"
        return "high"


def build_risks_and_suggestions(ratios: Dict[str, Any], analysis: Dict[str, Any]) -> Dict[str, List[dict]]:
    risks: List[dict] = []
    suggestions: List[dict] = []

    # ── 1. 流水覆盖率（月流入 / 月供）──────────────────────────
    cov = ratios.get("coverage_ratio")
    if cov is not None:
        lvl = _level_for(cov, THRESHOLDS["coverage"], "higher_better")
        if lvl != "low":
            risks.append({
                "level": lvl,
                "category": "偿债覆盖",
                "title": f"流水覆盖率仅 {cov:.2f}（{'警戒' if lvl == 'medium' else '不足'}）",
                "detail": f"月均流水 / 月均月供 应 ≥ {THRESHOLDS['coverage']['healthy']}，"
                          f"当前覆盖倍数偏低，体现偿债能力紧张",
            })
            suggestions.append({
                "category": "提升覆盖率",
                "action": "① 优先结清余额小的消费贷/信用贷减少月供；② 增加稳定业务性入账",
                "priority": "high" if lvl == "high" else "medium",
            })
    else:
        risks.append({
            "level": "low", "category": "数据缺失",
            "title": "未录入「现有贷款月还款总额」",
            "detail": "缺少输入，无法计算流水覆盖率",
        })

    # ── 2. 收支平衡率（月净流入 / 月流入）──────────────────────
    bal = ratios.get("balance_ratio")
    if bal is not None:
        lvl = _level_for(bal, THRESHOLDS["balance"], "higher_better")
        if lvl != "low":
            risks.append({
                "level": lvl,
                "category": "收支结构",
                "title": f"收支平衡率 {bal*100:.1f}%（{'偏低' if lvl == 'medium' else '严重偏低'}）",
                "detail": f"月均净流入占比应 ≥ {int(THRESHOLDS['balance']['healthy']*100)}%，"
                          f"当前支出压力偏大，结余薄",
            })
            suggestions.append({
                "category": "改善结余",
                "action": "压缩非必要经营支出，或梳理成本结构；避免申贷时被银行认定为「高流水低利润」",
                "priority": "high" if lvl == "high" else "medium",
            })

    # ── 3. 流水波动系数（std/mean）─────────────────────────────
    vol = ratios.get("volatility_coef")
    if vol is not None:
        lvl = _level_for(vol, THRESHOLDS["volatility"], "lower_better")
        if lvl != "low":
            risks.append({
                "level": lvl,
                "category": "流水稳定性",
                "title": f"流水波动系数 {vol:.2f}（{'偏高' if lvl == 'medium' else '严重偏高'}）",
                "detail": f"月度流入波动剧烈（阈值 {THRESHOLDS['volatility']['healthy']}），"
                          f"银行可能质疑业务持续性或怀疑流水真实性",
            })
            suggestions.append({
                "category": "稳定月度流水",
                "action": "① 申贷前 6 个月避免异常大额出入；② 若为行业淡旺季导致，备好业务说明材料",
                "priority": "high" if lvl == "high" else "medium",
            })

    # ── 4. 月均流水 / 目标贷款金额（银行"10 倍原则"）──────────
    lc = ratios.get("loan_cover_ratio")
    if lc is not None:
        lvl = _level_for(lc, THRESHOLDS["loan_ratio"], "higher_better")
        if lvl != "low":
            risks.append({
                "level": lvl,
                "category": "目标贷款匹配",
                "title": f"月均流水 / 目标贷款额 仅 {lc*100:.1f}%",
                "detail": f"银行经验：月均流水应 ≥ 贷款金额的 "
                          f"{int(THRESHOLDS['loan_ratio']['healthy']*100)}%（即 10 倍覆盖）。"
                          f"当前比例偏低，大额度申请可能不过初审",
            })
            suggestions.append({
                "category": "调整申贷策略",
                "action": "① 降低目标贷款额，匹配当前流水；② 合并其他账户流水；③ 3-6 个月内做大业务性入账后再申",
                "priority": "high" if lvl == "high" else "medium",
            })

    # ── 5. 最低余额 / 月均流入（资金链紧张）──────────────────
    lb = ratios.get("low_balance_ratio")
    if lb is not None:
        lvl = _level_for(lb, THRESHOLDS["low_balance"], "higher_better")
        if lvl != "low":
            risks.append({
                "level": lvl,
                "category": "资金储备",
                "title": f"最低余额仅占月均流入 {lb*100:.1f}%",
                "detail": "最低余额频繁接近零，资金链紧张信号，银行倾向判定抗风险能力弱",
            })
            suggestions.append({
                "category": "维持日均余额",
                "action": "申贷前 3 个月保持账户日均余额 ≥ 月均流入的 10%，避免频繁归零",
                "priority": "high" if lvl == "high" else "medium",
            })

    # ── 6. 对手方高度集中（阶段 B 完整版，这里先给最粗提醒）──
    top = analysis.get("top_income_sources") or []
    if top and float(top[0].get("ratio") or 0) > 50:
        risks.append({
            "level": "medium",
            "category": "收入集中",
            "title": f"第一大对手方「{top[0].get('counterparty', '')}」占收入 {top[0].get('ratio')}%",
            "detail": "单一客户占比过高，银行视为客户集中风险，业务抗冲击能力弱",
        })
        suggestions.append({
            "category": "分散客户",
            "action": "补充多个真实业务入账对手方，降低单一客户占比至 30% 以下",
            "priority": "medium",
        })

    # 排序：high > medium > low
    order = {"high": 0, "medium": 1, "low": 2}
    risks.sort(key=lambda r: order.get(r["level"], 9))
    return {"risks": risks, "suggestions": suggestions}


# ─── 报告组装 ────────────────────────────────────────────────────────

def build_bank_diagnosis_report(
    client: Client,
    statements: List[BankStatement],
    context: Optional[BankAnalysisContext],
) -> Dict[str, Any]:
    from datetime import datetime

    analysis = merge_client_transactions(client, statements, context)
    ratios = compute_ratios(analysis, context)
    rs = build_risks_and_suggestions(ratios, analysis)

    high = sum(1 for r in rs["risks"] if r["level"] == "high")
    medium = sum(1 for r in rs["risks"] if r["level"] == "medium")
    low = sum(1 for r in rs["risks"] if r["level"] == "low")

    return {
        "client_name": client.name,
        "client_company": client.company_name,
        "generated_at": datetime.utcnow().isoformat(),
        "account_count": analysis.get("account_count", 0),
        "banks": analysis.get("banks", []),
        "context": {
            "target_loan_amount": context.target_loan_amount if context else None,
            "existing_monthly_payment": context.existing_monthly_payment if context else None,
        },
        "overview": {
            "monthly_avg_income": analysis.get("deduped_monthly_avg_income", 0),
            "monthly_avg_expense": analysis.get("deduped_monthly_avg_expense", 0),
            "monthly_avg_net": (
                float(analysis.get("deduped_monthly_avg_income") or 0)
                - float(analysis.get("deduped_monthly_avg_expense") or 0)
            ),
            "total_income": analysis.get("deduped_total_income", 0),
            "total_expense": analysis.get("deduped_total_expense", 0),
            "min_balance": analysis.get("min_balance", 0),
            "avg_balance": analysis.get("avg_balance", 0),
            "monthly_avg_tx_count": analysis.get("monthly_avg_tx_count", 0),
        },
        "ratios": ratios,
        "thresholds": THRESHOLDS,
        "monthly_summary": analysis.get("monthly_summary", []),
        "top_income_sources": analysis.get("top_income_sources", []),
        "top_expense_categories": analysis.get("top_expense_categories", []),
        "monthly_ending_balances": analysis.get("monthly_ending_balances", []),
        "risks": rs["risks"],
        "suggestions": rs["suggestions"],
        "risk_summary": {"high": high, "medium": medium, "low": low},
    }


# ─── 辅助：从征信数据预填"现有月还款" ────────────────────────────────

def prefill_monthly_payment_from_credit(db: Session, client_id: int) -> Optional[float]:
    """
    从客户最新征信报告的 institutions[].monthly_payment 求和。
    优先 manual_data（人工录入更准），其次 parsed_data。返回 None 表示无数据。
    """
    report = (
        db.query(CreditReport)
        .filter(CreditReport.client_id == client_id)
        .order_by(CreditReport.created_at.desc())
        .first()
    )
    if not report:
        return None

    def _sum(data):
        if not isinstance(data, dict):
            return None
        insts = data.get("institutions") or data.get("institution_details") or []
        if not isinstance(insts, list):
            return None
        total = 0.0
        found = False
        for it in insts:
            if isinstance(it, dict):
                v = it.get("monthly_payment")
                if v not in (None, ""):
                    try:
                        total += float(v)
                        found = True
                    except (TypeError, ValueError):
                        pass
        return round(total, 2) if found else None

    for src in (report.manual_data, report.parsed_data):
        v = _sum(src)
        if v is not None:
            return v
    return None
