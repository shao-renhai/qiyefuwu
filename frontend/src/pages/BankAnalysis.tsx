import { useState } from 'react';
import { Typography, Input, Button, message, Space, Table, Tag } from 'antd';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components';
import FileUploader from '../components/FileUploader';
import {
  createClient,
  uploadBankStatement,
} from '../services/api';
import type { BankAnalysis as BankAnalysisData, AnomalyItem } from '../services/api';

echarts.use([BarChart, LineChart, CanvasRenderer, TooltipComponent, GridComponent, LegendComponent]);

const { Title, Text } = Typography;

function money(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)}万`;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
}

export default function BankAnalysis() {
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
        setData(result.analysis);
        message.success('银行流水分析完成');
      }
    } catch {
      message.error('上传失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // Monthly trend chart
  const trendOption = data && data.monthly_summary.length > 0
    ? {
        grid: { left: 16, right: 16, top: 40, bottom: 24, containLabel: true },
        legend: {
          data: ['收入', '支出'],
          top: 0,
          textStyle: { color: '#86868B', fontSize: 12 },
        },
        xAxis: {
          type: 'category' as const,
          data: data.monthly_summary.map((m) => m.month),
          axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
          axisLabel: { color: '#86868B', fontSize: 11 },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value' as const,
          axisLine: { show: false },
          axisLabel: { color: '#AEAEB2', fontSize: 11, formatter: (v: number) => money(v) },
          splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)' } },
        },
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: Array<{ seriesName: string; value: number; axisValue: string }>) => {
            let html = `<b>${params[0].axisValue}</b><br/>`;
            params.forEach((p) => {
              html += `${p.seriesName}: ${money(p.value)}<br/>`;
            });
            return html;
          },
        },
        series: [
          {
            name: '收入',
            type: 'bar',
            data: data.monthly_summary.map((m) => m.income),
            barWidth: 16,
            itemStyle: {
              borderRadius: [4, 4, 0, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#34C759' },
                { offset: 1, color: 'rgba(52,199,89,0.3)' },
              ]),
            },
          },
          {
            name: '支出',
            type: 'bar',
            data: data.monthly_summary.map((m) => m.expense),
            barWidth: 16,
            itemStyle: {
              borderRadius: [4, 4, 0, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#FF3B30' },
                { offset: 1, color: 'rgba(255,59,48,0.3)' },
              ]),
            },
          },
        ],
      }
    : null;

  // Net income trend line
  const netOption = data && data.monthly_summary.length > 0
    ? {
        grid: { left: 16, right: 16, top: 20, bottom: 24, containLabel: true },
        xAxis: {
          type: 'category' as const,
          data: data.monthly_summary.map((m) => m.month),
          axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
          axisLabel: { color: '#86868B', fontSize: 11 },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value' as const,
          axisLine: { show: false },
          axisLabel: { color: '#AEAEB2', fontSize: 11, formatter: (v: number) => money(v) },
          splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)' } },
        },
        series: [
          {
            type: 'line',
            data: data.monthly_summary.map((m) => m.net),
            smooth: true,
            lineStyle: { color: '#007AFF', width: 3 },
            itemStyle: { color: '#007AFF' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(0,122,255,0.15)' },
                { offset: 1, color: 'rgba(0,122,255,0)' },
              ]),
            },
          },
        ],
        tooltip: {
          formatter: (p: { name: string; value: number }) => `${p.name}<br/>净收入: ${money(p.value)}`,
        },
      }
    : null;

  const anomalyColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 100 },
    { title: '对方', dataIndex: 'counterparty', key: 'counterparty', ellipsis: true },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: '#1D1D1F' }}>{money(v)}</span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: string) => {
        const map: Record<string, { color: string; label: string }> = {
          large_amount: { color: '#FF3B30', label: '大额' },
          round_number: { color: '#FF9F0A', label: '整数' },
          regular_pattern: { color: '#007AFF', label: '规律' },
        };
        const info = map[t] || { color: '#86868B', label: t };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title
          level={3}
          style={{ color: '#1D1D1F', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}
        >
          流水分析
        </Title>
        <Text style={{ color: '#86868B', fontSize: 14 }}>
          上传银行流水，智能分析收支趋势与异常交易
        </Text>
      </div>

      {/* Upload */}
      {!data && (
        <div className="glass-card" style={{ padding: 32, marginBottom: 24 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space size="middle">
              <Input
                size="large"
                placeholder="客户姓名"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                disabled={!!clientId}
                style={{
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  width: 200,
                }}
              />
              <Input
                size="large"
                placeholder="银行名称（选填）"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                style={{
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  width: 200,
                }}
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

      {/* Results */}
      {data && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#86868B', fontSize: 13 }}>
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
            {/* Stats */}
            <div className="stat-card">
              <div className="stat-label">总收入</div>
              <div className="stat-value success">{money(data.total_income)}</div>
              <div className="stat-sub">去重后 {money(data.deduped_total_income)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">总支出</div>
              <div className="stat-value danger">{money(data.total_expense)}</div>
              <div className="stat-sub">去重后 {money(data.deduped_total_expense)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">月均收入</div>
              <div className="stat-value">{money(data.monthly_avg_income)}</div>
              <div className="stat-sub">去重后 {money(data.deduped_monthly_avg_income)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">月均净收入</div>
              <div
                className={`stat-value ${data.monthly_avg_net >= 0 ? 'success' : 'danger'}`}
              >
                {money(data.monthly_avg_net)}
              </div>
              <div className="stat-sub">月均支出 {money(data.monthly_avg_expense)}</div>
            </div>

            {/* Monthly trend */}
            {trendOption && (
              <div className="span-4 chart-card">
                <div className="chart-title">月度收支趋势</div>
                <ReactEChartsCore
                  echarts={echarts}
                  option={trendOption}
                  style={{ height: 280 }}
                />
              </div>
            )}

            {/* Net income trend */}
            {netOption && (
              <div className="span-2 chart-card">
                <div className="chart-title">净收入趋势</div>
                <ReactEChartsCore
                  echarts={echarts}
                  option={netOption}
                  style={{ height: 200 }}
                />
              </div>
            )}

            {/* Top income sources */}
            <div className="span-2 chart-card">
              <div className="chart-title">主要收入来源</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.top_income_sources.slice(0, 5).map((s, i) => (
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
                    <span style={{ fontSize: 13, color: '#1D1D1F', fontWeight: 500 }}>
                      {s.counterparty || '未知'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#34C759' }}>
                      {money(s.amount)}
                    </span>
                  </div>
                ))}
                {data.top_income_sources.length === 0 && (
                  <div style={{ color: '#AEAEB2', fontSize: 13, padding: 12 }}>暂无数据</div>
                )}
              </div>
            </div>

            {/* Anomalies */}
            {data.anomalies && data.anomalies.length > 0 && (
              <div className="span-4 chart-card">
                <div className="chart-title">异常交易</div>
                <Table
                  dataSource={data.anomalies.map((a: AnomalyItem, i: number) => ({
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
