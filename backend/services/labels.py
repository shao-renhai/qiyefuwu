"""对外标签的单一数据源。

所有 API 响应中给前端/客户看的字段名,统一从这里取。
背景:本平台是融资顾问 SaaS 工具,不是征信/放贷机构,
所有"评分"均为顾问内部诊断,不构成对客户的信用评估。
详见 docs/POSITIONING.md。
"""

DIAGNOSIS_LABELS = {
    "score_credit":     "征信资料完整度",
    "score_cashflow":   "现金流资料完整度",
    "score_structure":  "公司结构资料完整度",
    "score_collateral": "抵押资料完整度",
    "score_intent":     "客户配合度评估",
    "score_total":      "顾问诊断综合分",
    "loan_min":         "顾问参考区间下限",
    "loan_max":         "顾问参考区间上限",
}

CASE_LABELS = {
    "recommended_bank": "案例对接银行（历史记录）",
    "approved_amount":  "案例实际批复（历史记录）",
}

DISCLAIMERS = {
    "diagnosis": "本评分为顾问内部资料整理诊断,非客户信用评估,不构成贷款承诺。",
    "case":     "案例库展示历史案例供顾问参考,不代表当前客户可获相同结果。",
}
