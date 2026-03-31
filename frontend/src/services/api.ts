import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

/* ─── Types ─── */

export interface Client {
  id: number;
  name: string;
  created_at: string;
}

export interface QueryRecordGroup {
  loan_approval: number;
  corporate_review: number;
}

export interface QueryRecords {
  recent_1m: QueryRecordGroup;
  recent_3m: QueryRecordGroup;
  recent_6m: QueryRecordGroup;
  recent_1y: QueryRecordGroup;
}

export interface CreditReportData {
  total_debt: number;
  total_balance: number;
  institution_details: Record<string, unknown>[];
  credit_card_total_limit: number;
  credit_card_used: number;
  credit_card_usage_rate: number;
  active_loans: Record<string, unknown>[];
  overdue_records: Record<string, unknown>[];
  query_records: QueryRecords;
}

export interface CreditReport {
  id: number;
  client_id: number;
  filename: string;
  file_type: string;
  parsed_data: CreditReportData;
  created_at: string;
}

export interface MonthlySummaryItem {
  month: string;
  income: number;
  expense: number;
  net_income: number;
  transaction_count: number;
}

export interface AnomalyItem {
  date: string;
  counterparty: string;
  amount: number;
  direction: string;
  anomaly_type: string;
  description: string;
}

export interface BankAnalysis {
  total_income: number;
  total_expense: number;
  monthly_avg_income: number;
  monthly_avg_expense: number;
  monthly_avg_income_deduped: number;
  monthly_avg_expense_deduped: number;
  top_income_sources: Record<string, number>;
  top_expense_categories: Record<string, number>;
  monthly_ending_balances: Record<string, number>;
  min_balance: number;
  avg_balance: number;
  transaction_count: number;
  monthly_summary: MonthlySummaryItem[];
  anomalies: AnomalyItem[];
}

export interface BankStatement {
  id: number;
  client_id: number;
  filename: string;
  bank_name: string;
  analysis: BankAnalysis;
  created_at: string;
}

export interface FullAnalysis {
  client: Client;
  credit_reports: CreditReport[];
  bank_statements: BankStatement[];
}

/* ─── API Functions ─── */

export async function createClient(name: string): Promise<Client> {
  const { data } = await http.post<Client>('/clients', { name });
  return data;
}

export async function listClients(): Promise<Client[]> {
  const { data } = await http.get<Client[]>('/clients');
  return data;
}

export async function uploadCreditReport(
  clientId: number,
  file: File,
): Promise<CreditReport> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<CreditReport>(
    `/clients/${clientId}/credit-report`,
    form,
  );
  return data;
}

export async function uploadBankStatement(
  clientId: number,
  file: File,
  bankName?: string,
): Promise<BankStatement> {
  const form = new FormData();
  form.append('file', file);
  if (bankName) form.append('bank_name', bankName);
  const { data } = await http.post<BankStatement>(
    `/clients/${clientId}/bank-statement`,
    form,
  );
  return data;
}

export async function getAnalysis(clientId: number): Promise<FullAnalysis> {
  const { data } = await http.get<FullAnalysis>(`/clients/${clientId}/analysis`);
  return data;
}

export async function exportExcel(clientId: number): Promise<Blob> {
  const { data } = await http.get(`/clients/${clientId}/export/excel`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportPdf(clientId: number): Promise<Blob> {
  const { data } = await http.get(`/clients/${clientId}/export/pdf`, {
    responseType: 'blob',
  });
  return data;
}
