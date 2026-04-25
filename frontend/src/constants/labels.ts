// 对外展示标签的单一数据源
// 详见 docs/POSITIONING.md

export const DIAGNOSIS_LABELS: Record<string, string> = {
  score_credit:     "征信资料完整度",
  score_cashflow:   "现金流资料完整度",
  score_structure:  "公司结构资料完整度",
  score_collateral: "抵押资料完整度",
  score_intent:     "客户配合度评估",
  score_total:      "顾问诊断综合分",
  loan_min:         "顾问参考区间下限",
  loan_max:         "顾问参考区间上限",
};

export const CASE_LABELS: Record<string, string> = {
  recommended_bank: "案例对接银行（历史记录）",
  approved_amount:  "案例实际批复（历史记录）",
};

export const DISCLAIMERS = {
  diagnosis: "本评分为顾问内部资料整理诊断,非客户信用评估,不构成贷款承诺。",
  case:      "案例库展示历史案例供顾问参考,不代表当前客户可获相同结果。",
};
