import { useState } from 'react';
import { Typography, Input, Button, message, Space, Table, Tag } from 'antd';
import FileUploader from '../components/FileUploader';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  createClient,
  uploadBankStatement,
} from '../services/api';
import type { BankAnalysis as BankAnalysisData, AnomalyItem } from '../services/api';

const { Title, Text } = Typography;

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function money(n: unknown): string {
  const v = toNum(n);
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
}

function BankAnalysisInner() {
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [bankName, setBankName] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BankAnalysisData | null>(null);

  const handleUpload = async (file: File) => {
    if (!clientName.trim()) {
      message.warning('请先输入客户姓名');
      return;
    }
    setLoading(true);
    try {
      let cid = clientId;
      if (!cid) {
        const c = await createClient(clientName.trim());
        cid = c.id;
        setClientId(cid);
      }
      const result = await uploadBankStatement(
        cid,
        file,
        clientName.trim(),
        bankName || undefined,
      );
      if (result.analysis) {
        // Sanitize: JSON round-trip to ensure all values are primitives
        const clean = JSON.parse(JSON.stringify(result.analysis)) as BankAnalysisData;
        setData(clean);
        message.success('银行流水分析完成');
      } else {
        message.warning('流水分析未返回数据，请检查上传文件格式');
      }
    } catch (err: unknown) {
      console.error('银行流水上传错误:', err);
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      message.error(error.response?.data?.detail || error.message || '上传失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const monthlySummary = data?.monthly_summary ?? [];
  const topIncomeSources = data?.top_income_sources ?? [];
  const anomalies = data?.anomalies ?? [];

  const anomalyColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 100 },
    { title: '对方', dataIndex: 'counterparty', key: 'counterparty', ellipsis: true },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: '#C9A962' }}>{money(v)}</span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: string) => {
        const map: Record<string, { color: string; label: string }> = {
          large_amount: { color: '#FF5630', label: '大额' },
          round_number: { color: '#FFAB00', label: '整数' },
          regular_pattern: { color: '#4C9AFF', label: '规律' },
        };
        const info = map[t] || { color: '#6B7280', label: t || '其他' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title
          level={3}
          style={{ color: '#1A1A2E', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}
        >
          流水分析
        </Title>
        <Text style={{ color: '#6B7280', fontSize: 14 }}>
          上传银行流水，智能分析收支趋势与异常交易
        </Text>
      </div>

      {!data && (
        <div style={{ padding: 32, marginBottom: 24 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space size="middle">
              <Input
                size="large"
                placeholder="客户姓名"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                disabled={!!clientId}
                style={{ borderRadius: 12, width: 200 }}
              />
              <Input
                size="large"
                placeholder="银行名称（选填）"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                style={{ borderRadius: 12, width: 200 }}
              />
            </Space>
            <FileUploader
              accept=".xlsx,.xls,.csv,.pdf"
              hint="支持 Excel、CSV、PDF 银行流水格式"
              onFileSelected={handleUpload}
              loading={loading}
            />
          </Space>
        </div>
      )}

      {data && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#6B7280', fontSize: 13 }}>
              客户：{clientName} {bankName && `· ${bankName}`}
            </Text>
            <Button
              size="small"
              onClick={() => {
                setData(null);
                setClientId(null);
                setClientName('');
                setBankName('');
              }}
              style={{ borderRadius: 8 }}
            >
              重新分析
            </Button>
          </div>

          <div className="bento-grid">
            <div className="stat-card">
              <div className="stat-label">总收入</div>
              <div className="stat-value" style={{ color: '#36B37E' }}>{money(data.total_income)}</div>
              <div className="stat-sub">去重后 {money(data.deduped_total_income)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">总支出</div>
              <div className="stat-value" style={{ color: '#FF5630' }}>{money(data.total_expense)}</div>
              <div className="stat-sub">去重后 {money(data.deduped_total_expense)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">月均收入</div>
              <div className="stat-value">{money(data.monthly_avg_income)}</div>
              <div className="stat-sub">去重后 {money(data.deduped_monthly_avg_income)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">月均净收入</div>
              <div className="stat-value" style={{ color: (data.monthly_avg_net ?? 0) >= 0 ? '#36B37E' : '#FF5630' }}>
                {money(data.monthly_avg_net)}
              </div>
              <div className="stat-sub">月均支出 {money(data.monthly_avg_expense)}</div>
            </div>

            {monthlySummary.length > 0 && (
              <div className="span-4 stat-card">
                <div className="stat-label">月度收支明细</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, padding: '8px 0' }}>
                  {monthlySummary.map((m, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.02)', borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>{String(m.month)}</div>
                      <div style={{ fontSize: 12, color: '#36B37E' }}>收入: {String(money(m.income))}</div>
                      <div style={{ fontSize: 12, color: '#FF5630' }}>支出: {String(money(m.expense))}</div>
                      <div style={{ fontSize: 12, color: toNum(m.net) >= 0 ? '#36B37E' : '#FF5630', fontWeight: 600 }}>净额: {String(money(m.net))}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="span-2 stat-card">
              <div className="stat-label">主要收入来源</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topIncomeSources.slice(0, 5).map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'rgba(0,0,0,0.02)',
                      borderRadius: 10,
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#1A1A2E', fontWeight: 500 }}>
                      {String(s.counterparty || '未知')}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#36B37E' }}>
                      {money(s.amount)}
                    </span>
                  </div>
                ))}
                {topIncomeSources.length === 0 && (
                  <div style={{ color: '#9CA3AF', fontSize: 13, padding: 12 }}>暂无数据</div>
                )}
              </div>
            </div>

            {anomalies.length > 0 && (
              <div className="span-4 stat-card">
                <div className="stat-label">异常交易</div>
                <Table
                  dataSource={anomalies.map((a: AnomalyItem, i: number) => ({
                    ...a,
                    key: i,
                  }))}
                  columns={anomalyColumns}
                  pagination={{ pageSize: 5, size: 'small' }}
                  size="small"
                  style={{ marginTop: 8 }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function BankAnalysis() {
  return (
    <ErrorBoundary>
      <BankAnalysisInner />
    </ErrorBoundary>
  );
}
