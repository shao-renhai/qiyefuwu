export type CaseStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type CaseTier = 'seed' | 'growth';

export interface Case {
  id: number;
  narrative: string;
  customer_id?: number | null;
  industry?: string | null;
  company_size?: string | null;
  company_age?: number | null;
  credit_status?: string | null;
  monthly_cashflow?: number | null;
  has_tax_record?: boolean | null;
  collateral_type?: string | null;
  collateral_value?: number | null;
  visit_reason?: string | null;
  core_problem?: string | null;
  urgency?: string | null;
  target_amount?: number | null;
  solution_type?: string | null;
  recommended_bank?: string | null;
  preparation_actions?: string | null;
  duration_days?: number | null;
  outcome?: string | null;
  approved_amount?: number | null;
  actual_rate?: number | null;
  bank_tier?: string | null;
  core_lessons?: string | null;
  status: CaseStatus;
  tier: CaseTier;
  review_notes?: string | null;
  published_at?: string | null;
  created_by_id?: number | null;
  reviewed_by_id?: number | null;
  created_at: string;
}

export interface CaseInput {
  narrative: string;
  customer_id?: number;
  industry: string;
  company_size?: string;
  company_age?: number;
  credit_status?: string;
  monthly_cashflow?: number;
  has_tax_record?: boolean;
  collateral_type?: string;
  collateral_value?: number;
  visit_reason?: string;
  core_problem?: string;
  urgency?: string;
  target_amount?: number;
  solution_type?: string;
  recommended_bank?: string;
  preparation_actions?: string;
  duration_days?: number;
  outcome?: string;
  approved_amount?: number;
  actual_rate?: number;
  bank_tier?: string;
  core_lessons?: string;
  status?: CaseStatus;
}
