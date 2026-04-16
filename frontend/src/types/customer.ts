export type CustomerStage =
  | 'lead'
  | 'invited'
  | 'consulting'
  | 'proposal'
  | 'closed_won'
  | 'closed_lost';

export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  company_name?: string | null;
  industry?: string | null;
  company_size?: string | null;
  source?: string | null;
  stage: CustomerStage;
  intent_level: number;
  target_amount?: number | null;
  next_follow_up_at?: string | null;
  company_age?: number | null;
  monthly_cashflow?: number | null;
  has_tax_record?: boolean | null;
  collateral_type?: string | null;
  collateral_value?: number | null;
  credit_status?: string | null;
  notes?: string | null;
  created_by_id?: number | null;
  assigned_to_id?: number | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  company_name?: string;
  industry?: string;
  company_size?: string;
  source?: string;
  stage?: CustomerStage;
  intent_level?: number;
  target_amount?: number;
  next_follow_up_at?: string;
  company_age?: number;
  monthly_cashflow?: number;
  has_tax_record?: boolean;
  collateral_type?: string;
  collateral_value?: number;
  credit_status?: string;
  notes?: string;
}

export type InteractionChannel = 'phone' | 'wechat' | 'visit' | 'other';

export interface CustomerInteraction {
  id: number;
  customer_id: number;
  channel: InteractionChannel;
  content: string;
  intent_level_after?: number | null;
  next_follow_up_at?: string | null;
  created_by_id?: number | null;
  created_at: string;
}

export interface InteractionInput {
  channel: InteractionChannel;
  content: string;
  intent_level_after?: number;
  next_follow_up_at?: string;
}
