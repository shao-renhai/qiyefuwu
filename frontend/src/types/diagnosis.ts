export type DimKey = 'credit' | 'cashflow' | 'structure' | 'collateral' | 'intent'

export interface DimScore {
  credit:     number
  cashflow:   number
  structure:  number
  collateral: number
  intent:     number
  total:      number
}

export interface AnswerMap {
  [questionId: string]: {
    label: string
    score: number
    aiTip: string
  }
}

// ─── 评分引擎返回的报告数据 ─────────────────────────────────────────

export interface RiskFlag {
  level:  'high' | 'medium' | 'low'
  title:  string
  detail: string
  action: string
}

export interface ScoreBreakdown {
  question_id:  string
  question:     string
  answer:       string
  raw_score:    number
  max_score:    number
  score_reason: string
}

export interface DimDetail {
  name:       string
  normalized: number
  weighted:   number
  breakdown:  ScoreBreakdown[]
  risk_flags: RiskFlag[]
}

export interface Grade {
  label: string
  desc:  string
  color: string
  level: string
}

export interface LoanRange {
  min:  number
  max:  number
  unit: string
  note: string
}

export interface PenaltyItem {
  name:    string
  penalty: number
  reason:  string
}

export interface BonusItem {
  name:   string
  bonus:  number
  reason: string
}

export interface PriorityItem {
  priority: number
  title:    string
  action:   string
}

export interface DataSources {
  credit: boolean
  bank:   boolean
}

export interface ReportData {
  diagnosis_id:    number
  client_id:       number | null
  share_token:     string | null
  score_total:     number
  score_credit:    number
  score_cashflow:  number
  score_structure: number
  score_collateral: number
  score_intent:    number
  grade:           Grade
  risk_flags:      RiskFlag[]
  top_priorities:  PriorityItem[]
  penalties:       PenaltyItem[]
  bonuses:         BonusItem[]
  dims:            Record<DimKey, DimDetail>
  loan_min:        number
  loan_max:        number
  loan_range:      LoanRange
  base_total:      number
  penalty_total:   number
  bonus_total:     number
  data_sources:    DataSources
  follow_up_at:    string | null
  status:          string
}

// ─── 会话状态 ───────────────────────────────────────────────────────

export interface ClientItem {
  id:           number
  name:         string
  company_name: string | null
  created_at:   string
}

export interface DiagnosisSession {
  diagnosisId:  number | null
  clientId:     number | null
  clientName:   string
  companyName:  string
  currentStep:  number
  answers:      AnswerMap
  scores:       DimScore
  reportData:   ReportData | null
  status:       'idle' | 'draft' | 'completed'
  viewMode:     'advisor' | 'client'
}

// ─── 题库类型 ───────────────────────────────────────────────────────

export interface QuestionOption {
  label:  string
  score:  number
  aiTip:  string
}

export interface Question {
  id:      string
  label:   string
  options: QuestionOption[]
}

export interface DiagnosisSection {
  key:       DimKey
  title:     string
  subtitle:  string
  weight:    number
  maxRaw:    number
  questions: Question[]
}
