import { useEffect, useState } from 'react';
import { Button, Col, Row, message, Space, Spin, Tabs } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import CreditSummary from '../components/CreditSummary';
import BankSummary from '../components/BankSummary';
import AnomalyTable from '../components/AnomalyTable';
import {
  getAnalysis,
  exportExcel,
  exportPdf,
  type FullAnalysis,
  type BankAnalysis,
  type AnomalyItem,
} from '../services/api';

interface ReportProps {
  clientId: number;
  onBack: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toLocaleString()}元`;
}

export default function Report({ clientId, onBack }: ReportProps) {
  const [data, setData] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAnalysis(clientId)
      .then(setData)
      .catch(() => message.error('加载分析数据失败'))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const blob = await exportExcel(clientId);
      downloadBlob(blob, `${data?.client.name ?? 'report'}_分析报告.xlsx`);
    } catch {
      message.error('导出 Excel 失败');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const blob = await exportPdf(clientId);
      downloadBlob(blob, `${data?.client.name ?? 'report'}_分析报告.pdf`);
    } catch {
      message.error('导出 PDF 失败');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!data) return null;

  const creditData = data.credit_reports?.[0]?.parsed_data;
  const allBankAnalyses: BankAnalysis[] = (data.bank_statements ?? [])
    .map((s) => s.analysis)
    .filter((a): a is BankAnalysis => a !== null);
  const mergedBank: BankAnalysis | null = allBankAnalyses.length > 0 ? allBankAnalyses[0] : null;
  const allAnomalies: AnomalyItem[] = allBankAnalyses.flatMap((a) => a.anomalies ?? []);

  const tabItems = [
    creditData
      ? { key: 'credit', label: '征信概况', children: <CreditSummary data={creditData} /> }
      : null,
    mergedBank
      ? { key: 'bank', label: '银行流水', children: <BankSummary data={mergedBank} /> }
      : null,
    {
      key: 'anomaly',
      label: `异常交易 (${allAnomalies.length})`,
      children: <AnomalyTable data={allAnomalies} />,
    },
    {
      key: 'summary',
      label: '综合评估',
      children: (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <div className="chart-container">
              <div className="chart-title">客户综合信息</div>
              <div style={{ padding: '8px 0' }}>
                {[
                  ['客户名称', data.client.name],
                  ['征信报告数', `${data.credit_reports?.length ?? 0} 份`],
                  ['银行流水数', `${data.bank_statements?.length ?? 0} 份`],
                  ...(creditData
                    ? [
                        ['总负债', fmtMoney(creditData.total_debt)],
                        ['信用卡使用率', `${creditData.credit_card_usage_rate}%`],
                        ['逾期记录', `${creditData.overdue_records?.length ?? 0} 条`],
                      ]
                    : []),
                  ...(mergedBank
                    ? [
                        ['月均收入(去重)', fmtMoney(mergedBank.deduped_monthly_avg_income)],
                        ['月均支出', fmtMoney(mergedBank.monthly_avg_expense)],
                        ['异常交易数', `${allAnomalies.length} 笔`],
                      ]
                    : []),
                ].map(([label, value], i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                    <span style={{ color: '#fff', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Col>
        </Row>
      ),
    },
  ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[];

  return (
    <div>
      {/* ── Header ── */}
      <div
        className="glass-card"
        style={{
          padding: '20px 28px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{data.client.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>融资分析报告</div>
        </div>
        <Space>
          <Button
            icon={<FileExcelOutlined />}
            loading={exporting}
            onClick={handleExportExcel}
            style={{ borderRadius: 8 }}
          >
            导出 Excel
          </Button>
          <Button
            icon={<FilePdfOutlined />}
            loading={exporting}
            onClick={handleExportPdf}
            style={{ borderRadius: 8 }}
          >
            导出 PDF
          </Button>
        </Space>
      </div>

      {/* ── Tabs ── */}
      <div className="glass-card" style={{ padding: '12px 20px 20px' }}>
        <Tabs items={tabItems} />
      </div>

      {/* ── Back button ── */}
      <div style={{ marginTop: 20 }}>
        <Button
          size="large"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{ borderRadius: 10 }}
        >
          上一步
        </Button>
      </div>
    </div>
  );
}
