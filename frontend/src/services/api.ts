import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes — OCR processing can take a while
});

// Auto-attach JWT token to all requests
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-redirect to login on 401
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

/* ─── Auth Types ─── */

export interface AuthUser {
  user_id: number;
  username: string;
  display_name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  display_name: string;
}

/* ─── Auth Functions ─── */

export async function register(
  username: string,
  password: string,
  displayName: string,
): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>('/auth/register', {
    username,
    password,
    display_name: displayName,
  });
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data));
  return data;
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>('/auth/login', {
    username,
    password,
  });
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data));
  return data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.reload();
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('token');
}

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
  parsed_data: CreditReportData | null;
  created_at: string;
}

export interface MonthlySummaryItem {
  month: string;
  income: number;
  expense: number;
  net: number;
  tx_count: number;
}

export interface AnomalyItem {
  date: string;
  counterparty: string;
  amount: number;
  direction: string;
  type: string;
  description: string;
}

export interface TopItem {
  counterparty: string;
  amount: number;
  ratio: number;
}

export interface MonthlyBalance {
  month: string;
  balance: number;
}

export interface BankAnalysis {
  total_income: number;
  total_expense: number;
  monthly_avg_income: number;
  monthly_avg_expense: number;
  monthly_avg_net: number;
  deduped_total_income: number;
  deduped_total_expense: number;
  deduped_monthly_avg_income: number;
  deduped_monthly_avg_expense: number;
  top_income_sources: TopItem[];
  top_expense_categories: TopItem[];
  monthly_ending_balances: MonthlyBalance[];
  min_balance: number;
  avg_balance: number;
  monthly_avg_tx_count: number;
  daily_avg_tx_count: number;
  monthly_summary: MonthlySummaryItem[];
  anomalies: AnomalyItem[];
}

export interface BankStatement {
  id: number;
  client_id: number;
  filename: string;
  bank_name: string | null;
  analysis: BankAnalysis | null;
  created_at: string;
}

export interface FullAnalysis {
  client: Client;
  credit_reports: CreditReport[];
  bank_statements: BankStatement[];
}

/* ─── API Functions ─── */

export async function createClient(name: string): Promise<Client> {
  const { data } = await http.post<Client>('/clients/', { name });
  return data;
}

export async function listClients(): Promise<Client[]> {
  const { data } = await http.get<Client[]>('/clients/');
  return data;
}

export async function uploadCreditReport(
  clientId: number,
  file: File,
): Promise<CreditReport> {
  const form = new FormData();
  form.append('file', file);
  form.append('client_id', String(clientId));
  const { data } = await http.post<CreditReport>(
    '/credit-report/upload',
    form,
  );
  return data;
}

export async function uploadBankStatement(
  clientId: number,
  file: File,
  accountHolder: string,
  bankName?: string,
): Promise<BankStatement> {
  const form = new FormData();
  form.append('file', file);
  form.append('client_id', String(clientId));
  form.append('account_holder', accountHolder);
  if (bankName) form.append('bank_name', bankName);
  const { data } = await http.post<BankStatement>(
    '/bank-statement/upload',
    form,
  );
  return data;
}

export async function getAnalysis(clientId: number): Promise<FullAnalysis> {
  const { data } = await http.get<FullAnalysis>(`/analysis/${clientId}`);
  return data;
}

export async function exportExcel(clientId: number): Promise<Blob> {
  const { data } = await http.get(`/export/${clientId}/excel`, {
    responseType: 'blob',
  });
  return data;
}

export async function exportPdf(clientId: number): Promise<Blob> {
  const { data } = await http.get(`/export/${clientId}/pdf`, {
    responseType: 'blob',
  });
  return data;
}
