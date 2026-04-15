"""
scoring_engine.py — 融资健康评分引擎
放在 backend/services/ 目录下

设计原则：
1. 规则引擎为主：每条规则透明可解释，顾问可向客户说清楚
2. 三层结构：原始分 → 维度分 → 总分，每层独立可追溯
3. 惩罚项机制：某些组合风险触发额外扣分
4. 权重可配置：历史案例校准后只改 WEIGHTS，不动逻辑

征信规则来源：12年真实融资案例提炼（2024年更新）
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ════════════════════════════════════════════════════════════════════
# 配置区 — 所有阈值和权重集中在这里，业务调整只改这里
# ════════════════════════════════════════════════════════════════════

WEIGHTS = {
    "credit":     0.30,   # A 征信健康
    "cashflow":   0.25,   # B 经营数据
    "structure":  0.20,   # C 融资结构
    "collateral": 0.15,   # D 抵押资源
    "intent":     0.10,   # E 融资意图
}

DIM_MAX_RAW = {
    "credit":     100,  # 重构为六子维度，满分100
    "cashflow":    50,
    "structure":   40,
    "collateral":  35,
    "intent":      20,
}

# ── 征信查询阈值（来源：12年案例，按时间窗口分层）────────────────────
QUERY_THRESHOLDS = {
    # (警戒值, 红线值)
    "1m":  (3, 5),    # 近1个月：警戒≥3次，红线≥5次
    "3m":  (5, 8),    # 近3个月：警戒≥5次，红线≥8次
    "6m":  (7, 11),   # 近6个月：警戒≥7次，红线≥11次
}

# ── 机构类型权重系数（同等查询次数，网贷危害更大）────────────────────
INSTITUTION_WEIGHT = {
    "bank":     1.0,   # 银行查询：正常计入
    "consumer": 1.5,   # 消金查询：1.5倍权重
    "p2p":      2.0,   # 网贷查询：2倍权重，直接触发降级
}

# ── 负债率阈值 ────────────────────────────────────────────────────
DEBT_RATIO_THRESHOLDS = {
    "safe":    0.50,   # 负债率≤50%：安全区
    "warning": 0.70,   # 负债率≥70%：红线
}

# ── 收入覆盖度阈值（月还款/月收入）──────────────────────────────────
COVERAGE_THRESHOLDS = {
    "safe":    0.50,   # 覆盖度≤50%：安全
    "warning": 0.70,   # 覆盖度≥70%：红线
}

# ── 行业系数（流水 × 系数 = 银行认定月收入）─────────────────────────
INDUSTRY_CASHFLOW_RATIO = {
    "trade":        0.20,   # 贸易（高流水低利润）
    "restaurant":   0.40,   # 餐饮
    "service":      0.50,   # 服务业
    "manufacture":  0.35,   # 制造业
    "construction": 0.30,   # 建筑/建材
    "retail":       0.30,   # 零售
    "medical":      0.55,   # 医疗
    "tech":         0.60,   # 科技/互联网
    "default":      0.40,   # 未知行业默认值
}

# ── 信用卡使用率阈值 ──────────────────────────────────────────────
CREDIT_CARD_THRESHOLDS = {
    "safe":    0.60,   # 使用率≤60%：安全
    "warning": 0.70,   # 使用率≥70%：红线
}

# ── 逾期时间窗口影响系数 ─────────────────────────────────────────
OVERDUE_IMPACT = {
    "current":      "veto",    # 当前逾期：一票否决
    "within_1y":    "major",   # 近1年逾期：影响大
    "1y_to_2y":     "minor",   # 1–2年前：可解释
    "over_2y":      "ignore",  # 2年前：基本忽略
    "lian3_lei6":   "veto",    # 连三累六：一票否决
}

# ── 修复周期表（顾问告知客户需要等多久）────────────────────────────
REPAIR_TIMELINE = {
    "query_excess":      "养满6个月再申请",
    "card_usage_high":   "还至70%以内，等下期账单更新（约1个月）",
    "overdue_current":   "还清后等1个月征信更新，再评估",
    "overdue_recent":    "无法加速，只能匹配仅看近2年数据的产品",
    "debt_ratio_high":   "还款降负债率至70%以内，至少1个月流水验证",
}


# ════════════════════════════════════════════════════════════════════
# 惩罚项 — 组合风险额外扣分
# ════════════════════════════════════════════════════════════════════

PENALTY_RULES = {

    # ── 查询维度惩罚 ──────────────────────────────────────────────

    "p2p_query_exists": {
        "condition": lambda r: r.p2p_query_count > 0,
        "penalty": 8,
        "reason": "存在网贷机构查询记录，银行系统直接降级处理，"
                  "即使总查询次数不多，网贷查询也是负面信号"
    },
    "same_day_concentrated": {
        # 同一天集中多次查询=主动申请行为，危险信号
        "condition": lambda r: r.same_day_max_queries >= 3,
        "penalty": 6,
        "reason": f"单日集中查询≥3次，银行判断为主动多头申请行为，"
                  f"非助贷代申请豁免场景下直接降级"
    },
    "query_1m_red": {
        "condition": lambda r: r.query_1m >= QUERY_THRESHOLDS["1m"][1],
        "penalty": 10,
        "reason": f"近1个月查询≥{QUERY_THRESHOLDS['1m'][1]}次，触发红线，"
                  f"银行基本拒绝，需立即停止所有新申请"
    },
    "query_3m_red": {
        "condition": lambda r: r.query_3m >= QUERY_THRESHOLDS["3m"][1],
        "penalty": 8,
        "reason": f"近3个月查询≥{QUERY_THRESHOLDS['3m'][1]}次，触发红线"
    },
    "query_6m_red": {
        "condition": lambda r: r.query_6m >= QUERY_THRESHOLDS["6m"][1],
        "penalty": 6,
        "reason": f"近6个月查询≥{QUERY_THRESHOLDS['6m'][1]}次，触发红线"
    },

    # ── 逾期维度惩罚 ──────────────────────────────────────────────

    "overdue_current_veto": {
        # 一票否决，最高惩罚
        "condition": lambda r: r.overdue_current,
        "penalty": 30,
        "reason": "当前存在未还逾期，一票否决，银行100%拒贷。"
                  "必须先还清所有逾期，等1个月征信更新后重新评估"
    },
    "lian3_lei6_veto": {
        # 连三累六同等处理
        "condition": lambda r: r.has_lian3_lei6,
        "penalty": 25,
        "reason": "存在连三累六严重逾期记录，基本等同于当前逾期，"
                  "绝大多数银行拒贷，只能匹配极少数特殊产品"
    },
    "overdue_within_1y": {
        "condition": lambda r: (not r.overdue_current and not r.has_lian3_lei6
                                and r.overdue_months_ago is not None
                                and r.overdue_months_ago <= 12),
        "penalty": 12,
        "reason": f"近1年内有逾期记录（{'{r.overdue_months_ago}'}个月前），"
                  f"影响较大，只能匹配仅看近2年数据的产品"
    },
    "overdue_still_borrowing": {
        "condition": lambda r: r.has_overdue and r.loan_count > 2,
        "penalty": 8,
        "reason": "有逾期记录且仍持续多头借贷，银行风控必重点审查"
    },

    # ── 负债维度惩罚 ──────────────────────────────────────────────

    "debt_ratio_red": {
        "condition": lambda r: r.debt_ratio is not None and r.debt_ratio >= DEBT_RATIO_THRESHOLDS["warning"],
        "penalty": 10,
        "reason": f"负债率≥{DEBT_RATIO_THRESHOLDS['warning']*100:.0f}%触发红线，"
                  f"银行认定还款能力不足，额度严重受限"
    },
    "coverage_ratio_red": {
        "condition": lambda r: r.coverage_ratio is not None and r.coverage_ratio >= COVERAGE_THRESHOLDS["warning"],
        "penalty": 8,
        "reason": f"月还款占月收入≥{COVERAGE_THRESHOLDS['warning']*100:.0f}%，"
                  f"银行判断现金流压力过大"
    },
    "guarantee_overload": {
        # 担保金额过高，全额计入负债
        "condition": lambda r: r.guarantee_amount > r.monthly_cashflow * 12,
        "penalty": 6,
        "reason": "对外担保金额超过年流水，担保金额全额计入负债，"
                  "实际负债率远高于账面"
    },

    # ── 信用卡维度惩罚 ────────────────────────────────────────────

    "card_usage_red": {
        "condition": lambda r: r.credit_card_usage is not None and r.credit_card_usage >= CREDIT_CARD_THRESHOLDS["warning"],
        "penalty": 6,
        "reason": f"信用卡使用率≥{CREDIT_CARD_THRESHOLDS['warning']*100:.0f}%，"
                  f"银行判断资金紧张，需先还款至60%以内"
    },
    "installment_debt_hidden": {
        # 大额分期全额计入负债，很多客户不知道
        "condition": lambda r: r.large_installment_amount > 0,
        "penalty": 4,
        "reason": "存在大额账单分期（装修贷/消费贷），全额计入负债，"
                  "实际负债率高于表面数字，银行会重新计算"
    },

    # ── 组合风险惩罚 ──────────────────────────────────────────────

    "bad_credit_urgent": {
        "condition": lambda r: (r.query_6m >= QUERY_THRESHOLDS["6m"][0]
                                and r.urgency == "urgent"),
        "penalty": 5,
        "reason": "征信查询偏多且资金极度紧急，被迫接受高息产品风险极高"
    },
    "multi_debt_mismatch": {
        "condition": lambda r: r.loan_count >= 5 and r.term_mismatch,
        "penalty": 8,
        "reason": "多头借贷且存在短贷长用，流动性危机风险高"
    },
    "high_cost_no_collateral": {
        "condition": lambda r: r.financing_cost_pct > 15 and r.collateral_value == 0,
        "penalty": 5,
        "reason": "融资成本过高且无抵押资产，置换降成本路径受阻"
    },
}


# ════════════════════════════════════════════════════════════════════
# 加分项 — 正向资质额外加分
# ════════════════════════════════════════════════════════════════════

BONUS_RULES = {

    "clean_query_structure": {
        # 查询少且全是银行查询，最优质信号
        "condition": lambda r: (r.query_6m <= 3
                                and r.p2p_query_count == 0
                                and r.same_day_max_queries <= 1),
        "bonus": 5,
        "reason": "查询极少且无网贷记录，征信质量优质，"
                  "可优先匹配国有行最低利率产品"
    },
    "tax_loan_qualified": {
        "condition": lambda r: r.tax_years >= 3 and r.monthly_cashflow >= 1000000,
        "bonus": 5,
        "reason": "连续纳税3年且流水充裕，税贷资格优质，"
                  "可申请年化3.5–5%的低息税贷"
    },
    "government_contract": {
        "condition": lambda r: r.has_gov_contract,
        "bonus": 5,
        "reason": "持有政府采购合同，可申请供应链金融，利率极低（3–4%）"
    },
    "clean_credit_structure": {
        # 三项全优：查询少+笔数少+无逾期
        "condition": lambda r: (r.loan_count <= 2
                                and r.query_6m <= 3
                                and not r.has_overdue
                                and r.p2p_query_count == 0),
        "bonus": 6,
        "reason": "征信结构极佳：查询少、负债少、无逾期、无网贷，"
                  "可优先匹配银行优质客户通道，利率和额度均有优势"
    },
    "low_debt_ratio": {
        # 负债率极低，还款能力充裕
        "condition": lambda r: (r.debt_ratio is not None
                                and r.debt_ratio <= 0.30
                                and r.coverage_ratio is not None
                                and r.coverage_ratio <= 0.30),
        "bonus": 4,
        "reason": "负债率和收入覆盖度均优秀，银行风控评分高，"
                  "额度上限可突破流水常规倍数"
    },
    "receivable_backed": {
        "condition": lambda r: r.receivable_amount >= 500,
        "bonus": 4,
        "reason": "大额应收账款可作质押，供应链金融额度充裕"
    },
}


# ─── 数据结构 ────────────────────────────────────────────────────────

class RiskLevel(str, Enum):
    HIGH   = "high"    # 高风险：需立即处理
    MEDIUM = "medium"  # 中风险：需关注
    LOW    = "low"     # 低风险/正向项


@dataclass
class RiskFlag:
    level:   RiskLevel
    title:   str            # 简短标题，显示在报告摘要
    detail:  str            # 详细说明，显示在完整报告
    action:  str            # 建议行动，付费报告解锁
    dim:     str            # 属于哪个维度


@dataclass
class ScoreBreakdown:
    """单题得分明细，支持完整追溯"""
    question_id:  str
    question:     str
    answer:       str
    raw_score:    int        # 该题得分
    max_score:    int        # 该题满分
    score_reason: str        # 为什么这么打分


@dataclass
class DimResult:
    """单维度评分结果"""
    key:        str
    name:       str
    raw_score:  int          # 原始分（各题之和）
    max_raw:    int          # 原始满分
    normalized: float        # 归一化到 0–100
    weight:     float        # 在总分中的权重
    weighted:   float        # 加权后对总分的贡献
    breakdown:  list[ScoreBreakdown] = field(default_factory=list)
    risk_flags: list[RiskFlag]       = field(default_factory=list)


@dataclass
class ScoringInput:
    """
    评分引擎输入：从诊断问卷 + 征信报告解析结果中提取
    字段命名和业务语义一一对应，方便后续维护

    征信字段说明：
    - query_1m/3m/6m：按时间窗口分层统计，比单一总数更精准
    - p2p_query_count：网贷查询单独统计，触发直接降级
    - same_day_max_queries：单日最大查询次数，判断主动申请行为
    - has_lian3_lei6：连三累六，一票否决场景
    """

    # ── A 征信维度（六子维度）────────────────────────────────────────

    # A1 查询维度
    query_1m:             int    # 近1个月硬查询次数（剔除贷后管理查询）
    query_3m:             int    # 近3个月硬查询次数
    query_6m:             int    # 近6个月硬查询次数
    bank_query_count:     int    # 其中银行机构查询次数
    consumer_query_count: int    # 消金机构查询次数
    p2p_query_count:      int    # 网贷机构查询次数（直接降级信号）
    same_day_max_queries: int    # 单日最大查询次数（≥3=主动申请预警）

    # A2 负债维度
    loan_count:           int    # 未结清贷款总笔数
    total_debt:           float  # 负债总额（万元，含担保全额）
    monthly_payment:      float  # 月还款额（万元）
    guarantee_amount:     float  # 对外担保金额（万元，全额计入负债）
    large_installment_amount: float  # 大额账单分期余额（装修贷/消费贷，万元）

    # A3 逾期维度
    has_overdue:          bool   # 有无任何逾期记录
    overdue_current:      bool   # 当前是否有未还逾期（一票否决）
    has_lian3_lei6:       bool   # 是否有连三累六记录（一票否决）
    overdue_months_ago:   Optional[int]  # 最近一次逾期距今月数（无逾期填None）

    # A4 信用卡维度
    credit_card_usage:    Optional[float]  # 信用卡综合使用率（0–1）

    # A5 担保维度（已在A2负债中计算，这里保留状态标记）
    has_active_guarantee: bool   # 是否有生效担保

    # ── B 经营数据 ────────────────────────────────────────────────

    monthly_cashflow:     float  # 月均流水（元）
    industry:             str    # 行业类型，用于确定收入系数
    cashflow_stable:      bool   # 流水是否规律（无大额代收代付）
    tax_years:            int    # 连续纳税年数
    has_tax_record:       bool   # 是否有纳税记录

    # ── C 融资结构 ────────────────────────────────────────────────

    short_term_ratio:     float  # 短期贷款占比（0–1）
    financing_cost_pct:   float  # 综合融资年化成本（%）
    term_mismatch:        bool   # 是否存在短贷长用
    concentrated_due:     bool   # 近12月是否有集中到期

    # ── D 抵押资源 ────────────────────────────────────────────────

    collateral_value:     float  # 未抵押不动产净值（万元）
    has_second_mortgage:  bool   # 是否有二押可能
    has_gov_contract:     bool   # 是否有政府采购合同
    receivable_amount:    float  # 核心企业应收账款（万元）

    # ── E 融资意图 ────────────────────────────────────────────────

    loan_purpose:         str    # "working_capital"|"expansion"|"refinance"
    urgency:              str    # "relaxed"|"normal"|"urgent"
    target_amount:        float  # 目标融资额（万元）

    # ── 计算字段（由引擎自动计算，也可外部传入覆盖）─────────────────

    # 负债率 = 负债总额 / (月均流水 × 12)，None则引擎自动计算
    debt_ratio:           Optional[float] = None
    # 收入覆盖度 = 月还款 / (月均流水 × 行业系数)，None则引擎自动计算
    coverage_ratio:       Optional[float] = None
    # 来自现有征信分析API的原始评分（可选，有则纳入参考）
    credit_api_score:     Optional[float] = None


# ─── 核心评分引擎 ────────────────────────────────────────────────────

class ScoringEngine:

    def score(self, inp: ScoringInput) -> dict:
        """
        主入口：输入问卷数据，输出完整评分结果
        返回 dict，可直接序列化存入数据库
        """
        dims = {
            "credit":     self._score_credit(inp),
            "cashflow":   self._score_cashflow(inp),
            "structure":  self._score_structure(inp),
            "collateral": self._score_collateral(inp),
            "intent":     self._score_intent(inp),
        }

        # 基础加权总分
        base_total = sum(d.weighted for d in dims.values())

        # 惩罚项扣分
        penalties = self._apply_penalties(inp)
        penalty_total = sum(p["penalty"] for p in penalties)

        # 加分项
        bonuses = self._apply_bonuses(inp)
        bonus_total = sum(b["bonus"] for b in bonuses)

        # 最终总分（限定在 0–100）
        final_total = max(0, min(100, round(base_total - penalty_total + bonus_total)))

        # 汇总所有风险标签
        all_flags = []
        for dim in dims.values():
            all_flags.extend(dim.risk_flags)

        return {
            "dims": {
                k: {
                    "name":       v.name,
                    "raw_score":  v.raw_score,
                    "max_raw":    v.max_raw,
                    "normalized": round(v.normalized),
                    "weighted":   round(v.weighted, 1),
                    "breakdown":  [
                        {
                            "question_id":  b.question_id,
                            "question":     b.question,
                            "answer":       b.answer,
                            "raw_score":    b.raw_score,
                            "max_score":    b.max_score,
                            "score_reason": b.score_reason,
                        }
                        for b in v.breakdown
                    ],
                    "risk_flags": [
                        {
                            "level":  f.level,
                            "title":  f.title,
                            "detail": f.detail,
                            "action": f.action,
                        }
                        for f in v.risk_flags
                    ],
                }
                for k, v in dims.items()
            },
            "base_total":    round(base_total),
            "penalties":     penalties,
            "bonuses":       bonuses,
            "penalty_total": penalty_total,
            "bonus_total":   bonus_total,
            "final_total":   final_total,
            "grade":         self._get_grade(final_total),
            "loan_range":    self._estimate_loan_range(final_total, inp),
            "risk_flags":    [
                {"level": f.level, "title": f.title, "detail": f.detail, "action": f.action}
                for f in sorted(all_flags, key=lambda x: {"high":0,"medium":1,"low":2}[x.level])
            ],
            "top_priorities": self._get_top_priorities(all_flags),
        }

    # ── A：征信健康度（六子维度）────────────────────────────────────

    def _score_credit(self, inp: ScoringInput) -> DimResult:
        """
        六子维度：查询(25) + 负债(25) + 逾期(25) + 信用卡(10) + 担保(10) + 修复预期(5)
        满分100，归一化后乘以整体权重0.30
        """
        breakdown = []
        flags = []
        raw = 0

        # ── A1 查询维度（满分25）─────────────────────────────────────
        if inp.query_1m >= QUERY_THRESHOLDS["1m"][1]:
            a1 = 0
            a1_reason = f"近1月{inp.query_1m}次，触红线（≥{QUERY_THRESHOLDS['1m'][1]}次）"
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title="近1月查询触发红线",
                detail=f"近1个月征信被查{inp.query_1m}次，已触发银行风控红线，自动降级。",
                action=REPAIR_TIMELINE["query_excess"]))
        elif inp.query_3m >= QUERY_THRESHOLDS["3m"][1]:
            a1 = 6
            a1_reason = f"近3月{inp.query_3m}次，触红线（≥{QUERY_THRESHOLDS['3m'][1]}次）"
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title="近3月查询触发红线",
                detail=f"近3个月征信被查{inp.query_3m}次，超出银行接受上限。",
                action=REPAIR_TIMELINE["query_excess"]))
        elif inp.query_6m >= QUERY_THRESHOLDS["6m"][1]:
            a1 = 10
            a1_reason = f"近6月{inp.query_6m}次，触红线（≥{QUERY_THRESHOLDS['6m'][1]}次）"
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="近6月查询触发红线",
                detail=f"近6个月征信被查{inp.query_6m}次，超出建议上限。",
                action=REPAIR_TIMELINE["query_excess"]))
        elif inp.query_1m >= QUERY_THRESHOLDS["1m"][0]:
            a1 = 14
            a1_reason = f"近1月{inp.query_1m}次，进入警戒区（≥{QUERY_THRESHOLDS['1m'][0]}次）"
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="近1月查询进入警戒区",
                detail=f"近1个月查询{inp.query_1m}次，建议本月暂停新申请。",
                action="本月暂停申请，下个账单周期后重新评估"))
        elif inp.query_6m >= QUERY_THRESHOLDS["6m"][0]:
            a1 = 18
            a1_reason = f"近6月{inp.query_6m}次，进入警戒区"
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="查询次数偏多",
                detail=f"近6个月查询{inp.query_6m}次，处于警戒区，控制新增查询。",
                action="暂停新增查询，等当前申请结果出来再决定下一步"))
        else:
            a1 = 25
            a1_reason = f"查询正常（近6月{inp.query_6m}次）"

        if inp.p2p_query_count > 0:
            a1 = max(0, a1 - 5)
            a1_reason += f"，含网贷查询{inp.p2p_query_count}次（降级）"
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title="存在网贷查询记录",
                detail=f"征信含{inp.p2p_query_count}次网贷机构查询，"
                       f"银行对网贷查询权重是银行查询的2倍，直接触发降级。",
                action="后续只走银行正规渠道，避免任何网贷平台查询"))

        if inp.same_day_max_queries >= 3:
            a1 = max(0, a1 - 4)
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="单日集中查询（主动申请信号）",
                detail=f"单日最多{inp.same_day_max_queries}次查询，"
                       f"银行判断为主动多头申请行为。",
                action="如为助贷机构代申请，可提供证明材料申请豁免"))

        breakdown.append(ScoreBreakdown("a1", "查询维度",
            f"近6月{inp.query_6m}次（银行{inp.bank_query_count}/消金{inp.consumer_query_count}/网贷{inp.p2p_query_count}）",
            a1, 25, a1_reason))
        raw += a1

        # ── A2 负债维度（满分25）─────────────────────────────────────
        industry_ratio = INDUSTRY_CASHFLOW_RATIO.get(inp.industry, INDUSTRY_CASHFLOW_RATIO["default"])
        monthly_income = inp.monthly_cashflow / 10000 * industry_ratio

        if inp.debt_ratio is None and inp.monthly_cashflow > 0:
            annual_cf = inp.monthly_cashflow / 10000 * 12
            inp.debt_ratio = inp.total_debt / annual_cf if annual_cf > 0 else 1.0
        if inp.coverage_ratio is None and monthly_income > 0:
            inp.coverage_ratio = inp.monthly_payment / monthly_income

        dr = inp.debt_ratio or 0
        cr = inp.coverage_ratio or 0

        if dr >= DEBT_RATIO_THRESHOLDS["warning"] or cr >= COVERAGE_THRESHOLDS["warning"]:
            a2 = 5
            a2_reason = f"负债率{dr*100:.0f}%/覆盖度{cr*100:.0f}%，触红线"
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title="负债率/收入覆盖度触红线",
                detail=f"负债率{dr*100:.0f}%（安全线50%），月还款占月收入{cr*100:.0f}%（安全线50%）。"
                       f"行业系数{industry_ratio}，认定月收入约{monthly_income:.1f}万。",
                action=REPAIR_TIMELINE["debt_ratio_high"]))
        elif dr >= DEBT_RATIO_THRESHOLDS["safe"] or cr >= COVERAGE_THRESHOLDS["safe"]:
            a2 = 14
            a2_reason = f"负债率{dr*100:.0f}%/覆盖度{cr*100:.0f}%，警戒区"
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="负债率偏高，进入警戒区",
                detail=f"负债率{dr*100:.0f}%，接近70%红线。",
                action="新增贷款前先还清部分短期小额贷款，降低负债率"))
        else:
            a2 = 25
            a2_reason = f"负债率{dr*100:.0f}%/覆盖度{cr*100:.0f}%，安全区"

        if inp.guarantee_amount > 0:
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="对外担保计入负债",
                detail=f"对外担保{inp.guarantee_amount:.0f}万，银行全额计入负债。"
                       f"法人为企业贷款担保同等处理。",
                action="担保项目结清后尽快更新银行记录"))

        breakdown.append(ScoreBreakdown("a2", "负债维度",
            f"负债率{dr*100:.0f}%，月还{inp.monthly_payment:.1f}万，认定月收入{monthly_income:.1f}万",
            a2, 25, a2_reason))
        raw += a2

        # ── A3 逾期维度（满分25）─────────────────────────────────────
        if inp.overdue_current:
            a3 = 0
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title="当前存在未还逾期【一票否决】",
                detail="当前有未还逾期，银行100%拒贷，无任何例外。",
                action=REPAIR_TIMELINE["overdue_current"]))
            a3_reason = "当前有未还逾期，一票否决"
        elif inp.has_lian3_lei6:
            a3 = 0
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title="连三累六严重逾期【一票否决】",
                detail="征信存在连三累六，与当前逾期等同处理，绝大多数银行拒贷。",
                action="只能匹配仅看近2年数据的产品"))
            a3_reason = "连三累六，一票否决"
        elif inp.overdue_months_ago is not None and inp.overdue_months_ago <= 12:
            a3 = 8
            flags.append(RiskFlag(level=RiskLevel.HIGH, dim="credit",
                title=f"近1年内有逾期（{inp.overdue_months_ago}个月前）",
                detail=f"逾期已还清但距今仅{inp.overdue_months_ago}个月，"
                       f"主流银行要求还清后12个月才考虑审批。",
                action=REPAIR_TIMELINE["overdue_recent"]))
            a3_reason = f"近1年内逾期（{inp.overdue_months_ago}个月前），影响大"
        elif inp.overdue_months_ago is not None and inp.overdue_months_ago <= 24:
            a3 = 16
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="1–2年前有逾期，可解释",
                detail=f"逾期距今{inp.overdue_months_ago}个月，部分银行可接受，"
                       f"申请时需主动提供逾期原因说明。",
                action="准备逾期说明材料，选择对历史逾期容忍度较高的城商行或农商行"))
            a3_reason = f"1–2年前逾期（{inp.overdue_months_ago}个月前），可解释"
        elif not inp.has_overdue:
            a3 = 25
            flags.append(RiskFlag(level=RiskLevel.LOW, dim="credit",
                title="无逾期记录（加分项）",
                detail="征信无任何逾期，可优先匹配国有行低利率产品。",
                action="保持这一优势"))
            a3_reason = "无任何逾期，征信清白"
        else:
            a3 = 22
            a3_reason = "2年前逾期，影响基本消退"

        breakdown.append(ScoreBreakdown("a3", "逾期维度",
            f"当前逾期:{inp.overdue_current} 连三累六:{inp.has_lian3_lei6} 最近:{inp.overdue_months_ago}个月前",
            a3, 25, a3_reason))
        raw += a3

        # ── A4 信用卡维度（满分10）───────────────────────────────────
        if inp.credit_card_usage is None:
            a4, a4_reason = 8, "信用卡使用率未知"
        elif inp.credit_card_usage >= CREDIT_CARD_THRESHOLDS["warning"]:
            a4 = 3
            a4_reason = f"使用率{inp.credit_card_usage*100:.0f}%，触红线（≥70%）"
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title=f"信用卡使用率过高（{inp.credit_card_usage*100:.0f}%）",
                detail=f"超过70%红线，银行判断资金紧张。大额分期/装修贷/消费贷全额计入负债。",
                action=REPAIR_TIMELINE["card_usage_high"]))
        elif inp.credit_card_usage >= CREDIT_CARD_THRESHOLDS["safe"]:
            a4 = 7
            a4_reason = f"使用率{inp.credit_card_usage*100:.0f}%，接近警戒"
        else:
            a4 = 10
            a4_reason = f"使用率{inp.credit_card_usage*100:.0f}%，健康"

        if inp.large_installment_amount > 0:
            flags.append(RiskFlag(level=RiskLevel.MEDIUM, dim="credit",
                title="大额账单分期计入负债",
                detail=f"大额分期余额{inp.large_installment_amount:.0f}万（装修贷/消费贷），"
                       f"全额计入负债，实际负债率高于表面数字。",
                action="申请前主动向银行说明分期用途，提供相关凭证"))

        breakdown.append(ScoreBreakdown("a4", "信用卡维度",
            f"使用率{inp.credit_card_usage*100:.0f}%" if inp.credit_card_usage else "未知",
            a4, 10, a4_reason))
        raw += a4

        # ── A5 担保维度（满分10）─────────────────────────────────────
        if inp.guarantee_amount == 0:
            a5, a5_reason = 10, "无对外担保，负债计算清晰"
        elif inp.guarantee_amount <= inp.monthly_cashflow / 10000 * 6:
            a5, a5_reason = 7, f"担保{inp.guarantee_amount:.0f}万，尚在可控范围"
        else:
            a5, a5_reason = 3, f"担保{inp.guarantee_amount:.0f}万，占比较高"

        breakdown.append(ScoreBreakdown("a5", "担保维度",
            f"担保{inp.guarantee_amount:.0f}万（全额计入负债）",
            a5, 10, a5_reason))
        raw += a5

        # ── A6 修复预期（满分5）──────────────────────────────────────
        if inp.overdue_current or inp.has_lian3_lei6:
            a6, a6_reason = 0, "存在一票否决项，短期无法修复"
        elif inp.query_1m >= QUERY_THRESHOLDS["1m"][1]:
            a6, a6_reason = 2, "查询触红线，需等6个月自然修复"
        elif not inp.has_overdue and inp.query_6m <= QUERY_THRESHOLDS["6m"][0]:
            a6, a6_reason = 5, "无重大缺陷，可立即申请"
        else:
            a6, a6_reason = 3, "存在可修复问题，3–6个月内可改善"

        breakdown.append(ScoreBreakdown("a6", "修复预期", "综合评估", a6, 5, a6_reason))
        raw += a6

        normalized = (raw / DIM_MAX_RAW["credit"]) * 100
        return DimResult(
            key="credit", name="征信健康度",
            raw_score=raw, max_raw=DIM_MAX_RAW["credit"],
            normalized=normalized, weight=WEIGHTS["credit"],
            weighted=normalized * WEIGHTS["credit"],
            breakdown=breakdown, risk_flags=flags
        )

    # ── B：经营数据质量 ──────────────────────────────────────────────

    def _score_cashflow(self, inp: ScoringInput) -> DimResult:
        breakdown = []
        flags = []

        # B1：月均流水（满分25）
        cf = inp.monthly_cashflow / 10000  # 转换为万元
        if cf >= 500:
            b1, b1_ans, b1_reason = 25, f"月均{cf:.0f}万", "流水充裕，可支撑大额申请"
        elif cf >= 100:
            b1, b1_ans, b1_reason = 18, f"月均{cf:.0f}万", "流水良好，可申请中等额度"
        elif cf >= 30:
            b1, b1_ans, b1_reason = 10, f"月均{cf:.0f}万", "流水偏低，建议先养3个月"
            flags.append(RiskFlag(
                level=RiskLevel.MEDIUM, dim="cashflow",
                title="月均流水偏低",
                detail=f"月均流水{cf:.0f}万，银行通常要求流水覆盖月还款额的3–5倍，"
                       f"当前流水对应可贷额度约{cf*10:.0f}–{cf*15:.0f}万。",
                action="建议3个月内将主要收款集中到该账户，增大有效流水，"
                       "每提升100万月均流水可新增约150万贷款空间……"
            ))
        else:
            b1, b1_ans, b1_reason = 4, f"月均{cf:.0f}万", "流水严重不足，当前不宜申请"
            flags.append(RiskFlag(
                level=RiskLevel.HIGH, dim="cashflow",
                title="月均流水严重不足",
                detail=f"月均流水仅{cf:.0f}万，无法支撑银行最低审批要求，"
                       f"强行申请不仅通过率极低，还会消耗宝贵的征信查询次数。",
                action="暂缓申请，先用3–6个月集中养流水，同时规划纳税数据……"
            ))

        if not inp.cashflow_stable:
            b1 = max(0, b1 - 5)
            flags.append(RiskFlag(
                level=RiskLevel.MEDIUM, dim="cashflow",
                title="流水规律性差",
                detail="流水波动大或有大额代收代付，银行会剔除异常流水重新计算有效流水，"
                       "实际认定额度通常低于账面50%。",
                action="建议将日常经营收款集中走对公账户，避免大额代收，"
                       "持续3个月后流水质量大幅提升……"
            ))

        breakdown.append(ScoreBreakdown("b1", "对公账户近6月月均流水",
                                        b1_ans, b1, 25, b1_reason))

        # B2：纳税记录（满分25）
        if inp.tax_years >= 3 and inp.has_tax_record:
            b2, b2_ans, b2_reason = 25, f"连续纳税{inp.tax_years}年", "税贷资格优质"
            flags.append(RiskFlag(
                level=RiskLevel.LOW, dim="cashflow",
                title="税贷资格优质（加分项）",
                detail=f"连续纳税{inp.tax_years}年，符合银行税贷最高门槛，"
                       f"可申请年化3.5–5%的低息税贷，是成本最低的融资渠道。",
                action="优先申请工商银行、建设银行、招商银行的税贷产品，"
                       "配合当前流水，预计可贷额度……"
            ))
        elif inp.has_tax_record:
            b2, b2_ans, b2_reason = 15, f"纳税记录不足3年", "可部分使用税贷产品"
        else:
            b2, b2_ans, b2_reason = 5, "无纳税记录", "税贷渠道关闭"
            flags.append(RiskFlag(
                level=RiskLevel.MEDIUM, dim="cashflow",
                title="无纳税记录，税贷渠道关闭",
                detail="无正规纳税记录，年化3–5%的税贷产品完全不可申请，"
                       "只能走流水贷或抵押贷款，综合成本较高。",
                action="如业务条件允许，建议开始规范纳税，3年后可新增税贷渠道，"
                       "每年节省利息成本约……"
            ))

        breakdown.append(ScoreBreakdown("b2", "纳税记录情况",
                                        b2_ans, b2, 25, b2_reason))

        raw = b1 + b2
        normalized = (raw / DIM_MAX_RAW["cashflow"]) * 100
        return DimResult(
            key="cashflow", name="经营数据质量",
            raw_score=raw, max_raw=DIM_MAX_RAW["cashflow"],
            normalized=normalized, weight=WEIGHTS["cashflow"],
            weighted=normalized * WEIGHTS["cashflow"],
            breakdown=breakdown, risk_flags=flags
        )

    # ── C：融资结构合理性 ────────────────────────────────────────────

    def _score_structure(self, inp: ScoringInput) -> DimResult:
        breakdown = []
        flags = []

        # C1：期限结构（满分20）
        if inp.short_term_ratio <= 0.3:
            c1, c1_ans, c1_reason = 20, "长期为主", "期限结构稳健，流动性风险低"
        elif inp.short_term_ratio <= 0.6:
            c1, c1_ans, c1_reason = 14, "短长期混合", "期限结构合理"
        else:
            c1, c1_ans, c1_reason = 7, "短期为主", "短贷占比过高，续贷压力大"
            flags.append(RiskFlag(
                level=RiskLevel.MEDIUM, dim="structure",
                title="短期贷款占比过高",
                detail=f"短期贷款占比{inp.short_term_ratio*100:.0f}%，"
                       f"每年需集中续贷，一旦银行收紧，面临无法续贷的流动性危机。",
                action="制定期限优化方案：在现有短期贷款到期前6个月，"
                       "提前申请3–5年期的中长期贷款置换……"
            ))

        if inp.concentrated_due:
            c1 = max(0, c1 - 5)
            flags.append(RiskFlag(
                level=RiskLevel.HIGH, dim="structure",
                title="近12月存在集中到期风险",
                detail="多笔贷款将在近12个月内集中到期，若无法同时续贷，"
                       "可能引发现金流断裂，是最紧迫的风险。",
                action="立即梳理各笔到期日，提前3个月开始续贷谈判，"
                       "同时准备应急过桥方案……"
            ))

        breakdown.append(ScoreBreakdown("c1", "贷款期限结构",
                                        c1_ans, c1, 20, c1_reason))

        # C2：融资成本（满分20）
        cost = inp.financing_cost_pct
        if cost <= 6:
            c2, c2_ans, c2_reason = 20, f"年化{cost:.1f}%", "成本优秀，主要来自银行渠道"
        elif cost <= 10:
            c2, c2_ans, c2_reason = 15, f"年化{cost:.1f}%", "成本良好，有优化空间"
        elif cost <= 15:
            c2, c2_ans, c2_reason = 9, f"年化{cost:.1f}%", "成本偏高，建议部分置换"
            flags.append(RiskFlag(
                level=RiskLevel.MEDIUM, dim="structure",
                title="综合融资成本偏高",
                detail=f"综合年化成本{cost:.1f}%，高于银行基准利率，"
                       f"如有抵押资产，可置换部分高息贷款，"
                       f"每100万贷款每年可节省约{(cost-6)*10000:.0f}元利息。",
                action="置换优先级：先置换利率最高的小贷/网贷，"
                       "用抵押贷款或税贷替换，预计置换后综合成本降至……"
            ))
        else:
            c2, c2_ans, c2_reason = 3, f"年化{cost:.1f}%", "成本过高，需立即优化"
            flags.append(RiskFlag(
                level=RiskLevel.HIGH, dim="structure",
                title="融资成本严重过高",
                detail=f"综合年化成本高达{cost:.1f}%，大概率含有民间借贷或高息小贷，"
                       f"额度越大损失越大，是最需要优先解决的问题。",
                action="紧急置换方案：1）立即停止续借高息产品；"
                       "2）优先申请银行抵押贷款置换；3）制定6个月成本优化路线图……"
            ))

        if inp.term_mismatch:
            c2 = max(0, c2 - 3)

        breakdown.append(ScoreBreakdown("c2", "综合融资年化成本",
                                        c2_ans, c2, 20, c2_reason))

        raw = c1 + c2
        normalized = (raw / DIM_MAX_RAW["structure"]) * 100
        return DimResult(
            key="structure", name="融资结构合理性",
            raw_score=raw, max_raw=DIM_MAX_RAW["structure"],
            normalized=normalized, weight=WEIGHTS["structure"],
            weighted=normalized * WEIGHTS["structure"],
            breakdown=breakdown, risk_flags=flags
        )

    # ── D：抵押与增信资源 ────────────────────────────────────────────

    def _score_collateral(self, inp: ScoringInput) -> DimResult:
        breakdown = []
        flags = []

        # D1：不动产（满分20）
        cv = inp.collateral_value
        if cv >= 500:
            d1, d1_ans, d1_reason = 20, f"净值约{cv:.0f}万", "抵押资源充裕，可撬动大额贷款"
        elif cv >= 100:
            d1, d1_ans, d1_reason = 14, f"净值约{cv:.0f}万", "有一定抵押空间"
        elif cv > 0:
            d1, d1_ans, d1_reason = 8, f"净值约{cv:.0f}万", "抵押空间有限"
        else:
            d1, d1_ans, d1_reason = 3, "无未抵押不动产", "需依赖信用类产品"
            flags.append(RiskFlag(
                level=RiskLevel.MEDIUM, dim="collateral",
                title="无抵押资产，融资上限受限",
                detail="无可用不动产抵押，只能依赖信用类产品，"
                       "额度上限通常不超过500万，且利率比抵押贷款高2–4个百分点。",
                action="替代方案：重点开发D2的政府合同或应收账款，"
                       "这两类资产可替代不动产作为增信……"
            ))

        breakdown.append(ScoreBreakdown("d1", "未抵押不动产净值",
                                        d1_ans, d1, 20, d1_reason))

        # D2：外部增信（满分15）
        if inp.has_gov_contract:
            d2, d2_ans, d2_reason = 15, "有政府采购合同", "可申请供应链金融，利率极低"
        elif inp.receivable_amount >= 200:
            d2, d2_ans, d2_reason = 10, f"应收账款约{inp.receivable_amount:.0f}万", \
                                    "可走应收账款质押融资"
        elif inp.receivable_amount > 0:
            d2, d2_ans, d2_reason = 6, f"应收账款约{inp.receivable_amount:.0f}万", \
                                    "应收账款规模偏小"
        else:
            d2, d2_ans, d2_reason = 4, "无外部增信资源", "只能依赖自身资质"

        breakdown.append(ScoreBreakdown("d2", "政府合同/应收账款增信",
                                        d2_ans, d2, 15, d2_reason))

        raw = d1 + d2
        normalized = (raw / DIM_MAX_RAW["collateral"]) * 100
        return DimResult(
            key="collateral", name="抵押与增信资源",
            raw_score=raw, max_raw=DIM_MAX_RAW["collateral"],
            normalized=normalized, weight=WEIGHTS["collateral"],
            weighted=normalized * WEIGHTS["collateral"],
            breakdown=breakdown, risk_flags=flags
        )

    # ── E：融资意图与时间窗口 ────────────────────────────────────────

    def _score_intent(self, inp: ScoringInput) -> DimResult:
        breakdown = []
        flags = []

        # E1：用途合理性（满分10）
        purpose_map = {
            "working_capital": (10, "补充流动资金", "用途清晰，银行审批友好"),
            "expansion":       (8,  "业务扩张",    "需匹配中长期产品，避免短贷长用"),
            "refinance":       (6,  "置换现有贷款",  "需精确规划时间节点"),
        }
        e1_score, e1_ans, e1_reason = purpose_map.get(
            inp.loan_purpose, (5, "其他用途", "需进一步明确"))

        if inp.loan_purpose == "expansion" and inp.short_term_ratio > 0.6:
            e1_score = max(0, e1_score - 3)
            flags.append(RiskFlag(
                level=RiskLevel.HIGH, dim="intent",
                title="扩张投入但贷款期限过短（短贷长用风险）",
                detail="业务扩张资金通常需要3年以上回报周期，"
                       "但当前贷款以短期为主，存在典型的短贷长用风险，"
                       "可能在资金未回收前就面临还款压力。",
                action="必须将扩张资金匹配3–5年期贷款，"
                       "同时保留流动资金专项短期额度……"
            ))

        breakdown.append(ScoreBreakdown("e1", "融资用途",
                                        e1_ans, e1_score, 10, e1_reason))

        # E2：紧迫程度（满分10）
        urgency_map = {
            "relaxed": (10, "1个月以上", "时间充裕，可走最优渠道"),
            "normal":  (7,  "2–4周内",  "时间偏紧，优先快速通道"),
            "urgent":  (3,  "1周内紧急", "时间极紧，需安排过桥资金"),
        }
        e2_score, e2_ans, e2_reason = urgency_map.get(
            inp.urgency, (5, "未知", ""))

        if inp.urgency == "urgent":
            flags.append(RiskFlag(
                level=RiskLevel.HIGH, dim="intent",
                title="资金需求极度紧急",
                detail="1周内需要资金，银行正常流程需要15–30个工作日，"
                       "几乎不可能及时到位。急用钱往往导致被迫接受高息产品。",
                action="两步走方案：1）立即安排过桥资金解燃眉之急（成本高但必要）；"
                       "2）同时启动银行申请流程，过桥到位后立即用银行贷款置换……"
            ))

        breakdown.append(ScoreBreakdown("e2", "资金紧迫程度",
                                        e2_ans, e2_score, 10, e2_reason))

        raw = e1_score + e2_score
        normalized = (raw / DIM_MAX_RAW["intent"]) * 100
        return DimResult(
            key="intent", name="融资意图与时间窗口",
            raw_score=raw, max_raw=DIM_MAX_RAW["intent"],
            normalized=normalized, weight=WEIGHTS["intent"],
            weighted=normalized * WEIGHTS["intent"],
            breakdown=breakdown, risk_flags=flags
        )

    # ── 惩罚 & 加分 ──────────────────────────────────────────────────

    def _apply_penalties(self, inp: ScoringInput) -> list[dict]:
        triggered = []
        for name, rule in PENALTY_RULES.items():
            try:
                if rule["condition"](inp):
                    triggered.append({
                        "name":    name,
                        "penalty": rule["penalty"],
                        "reason":  rule["reason"],
                    })
            except Exception:
                pass
        return triggered

    def _apply_bonuses(self, inp: ScoringInput) -> list[dict]:
        triggered = []
        for name, rule in BONUS_RULES.items():
            try:
                if rule["condition"](inp):
                    triggered.append({
                        "name":  name,
                        "bonus": rule["bonus"],
                        "reason": rule["reason"],
                    })
            except Exception:
                pass
        return triggered

    # ── 等级和额度 ───────────────────────────────────────────────────

    def _get_grade(self, total: float) -> dict:
        if total >= 85:
            return {"label": "优秀", "desc": "可冲刺顶级银行产品",
                    "color": "#1D9E75", "level": "A"}
        if total >= 70:
            return {"label": "良好", "desc": "可申请主流银行产品",
                    "color": "#185FA5", "level": "B"}
        if total >= 55:
            return {"label": "警示", "desc": "需修复后再申请",
                    "color": "#BA7517", "level": "C"}
        return {"label": "危险", "desc": "建议先整改再融资",
                "color": "#E24B4A", "level": "D"}

    def _estimate_loan_range(self, total: float, inp: ScoringInput) -> dict:
        """
        根据总分 + 关键指标估算贷款区间
        后续可用历史案例数据校准这里的系数
        """
        cf_monthly = inp.monthly_cashflow / 10000  # 万元

        # 基础额度：流水×倍数
        if total >= 85:
            base = cf_monthly * 18
        elif total >= 70:
            base = cf_monthly * 12
        elif total >= 55:
            base = cf_monthly * 6
        else:
            base = cf_monthly * 3

        # 抵押物补充额度：净值×70%
        collateral_add = inp.collateral_value * 0.7

        # 政府合同补充额度
        gov_add = 200 if inp.has_gov_contract else 0

        total_max = base + collateral_add + gov_add

        # 根据风险等级打折
        if total >= 70:
            loan_min = total_max * 0.5
            loan_max = total_max
        else:
            loan_min = total_max * 0.3
            loan_max = total_max * 0.6

        return {
            "min": round(loan_min),
            "max": round(loan_max),
            "unit": "万元",
            "note": "基于当前数据估算，实际额度以银行审批为准",
        }

    def _get_top_priorities(self, flags: list[RiskFlag]) -> list[dict]:
        """返回最高优先级的3个行动项，显示在报告首页"""
        high_flags = [f for f in flags if f.level == RiskLevel.HIGH]
        mid_flags  = [f for f in flags if f.level == RiskLevel.MEDIUM]
        priorities = (high_flags + mid_flags)[:3]
        return [
            {"priority": i + 1, "title": f.title, "action": f.action}
            for i, f in enumerate(priorities)
        ]
