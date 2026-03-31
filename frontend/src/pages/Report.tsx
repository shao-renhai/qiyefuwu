import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, message, Space, Spin, Tabs } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
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
  return `${v.toFixed(2)}元`;
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

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!data) return null;

  const creditData = data.credit_reports?.[0]?.parsed_data;

  // Merge all bank analyses
  const allBankAnalyses: BankAnalysis[] = data.bank_statements
    ?.map((s) => s.analysis)
    .filter(Boolean) ?? [];

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
      label: '异常交易',
      children: <AnomalyTable data={allAnomalies} />,
    },
    {
      key: 'summary',
      label: '综合评估',
      children: (
        <Card>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="客户名称">{data.client.name}</Descriptions.Item>
            <Descriptions.Item label="征信报告数">{data.credit_reports?.length ?? 0}</Descriptions.Item>
            <Descriptions.Item label="银行流水数">{data.bank_statements?.length ?? 0}</Descriptions.Item>
            {creditData && (
              <>
                <Descriptions.Item label="总负债">{fmtMoney(creditData.total_debt)}</Descriptions.Item>
                <Descriptions.Item label="信用卡使用率">{creditData.credit_card_usage_rate}%</Descriptions.Item>
                <Descriptions.Item label="逾期记录">{creditData.overdue_records?.length ?? 0} 条</Descriptions.Item>
              </>
            )}
            {mergedBank && (
              <>
                <Descriptions.Item label="月均收入(去重)">{fmtMoney(mergedBank.monthly_avg_income_deduped ?? mergedBank.monthly_avg_income)}</Descriptions.Item>
                <Descriptions.Item label="月均支出">{fmtMoney(mergedBank.monthly_avg_expense)}</Descriptions.Item>
                <Descriptions.Item label="异常交易数">{allAnomalies.length} 笔</Descriptions.Item>
              </>
            )}
          </Descriptions>
        </Card>
      ),
    },
  ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[];

  return (
    <Card
      title={`${data.client.name} — 融资分析报告`}
      extra={
        <Space>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportExcel}>
            导出 Excel
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportPdf}>
            导出 PDF
          </Button>
        </Space>
      }
    >
      <Tabs items={tabItems} />
      <div style={{ marginTop: 16 }}>
        <Button onClick={onBack}>&larr; 上一步</Button>
      </div>
    </Card>
  );
}
