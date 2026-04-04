import { useState } from 'react';
import { Typography, Input, Button, message, Space } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { GaugeChart, RadarChart, BarChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { TooltipComponent, GridComponent, RadarComponent } from 'echarts/components';
import FileUploader from '../components/FileUploader';
import {
  createClient,
  uploadCreditReport,
  CreditReportData,
} from '../services/api';

echarts.use([GaugeChart, RadarChart, BarChart, CanvasRenderer, TooltipComponent, GridComponent, RadarComponent]);

const { Title, Text } = Typography;

function money(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

export default function CreditAnalysis() {
  const [clientName, setClientName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CreditReportData | null>(null);

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
      const report = await uploadCreditReport(cid, file);
      if (report.parsed_data) {
        setData(report.parsed_data);
        message.success('征信报告解析完成');
      } else {
        message.warning('解析未返回数据');
      }
    } catch {
      message.error('上传失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // Gauge option for credit card usage rate
  const gaugeOption = data
    ? {
        series: [
          {
            type: 'gauge',
            startAngle: 200,
            endAngle: -20,
            min: 0,
            max: 100,
            radius: '90%',
            itemStyle: {
              color: data.credit_card_usage_rate > 70 ? '#FF3B30' : data.credit_card_usage_rate > 50 ? '#FF9F0A' : '#34C759',
            },
            progress: { show: true, width: 12, roundCap: true },
            pointer: { show: false },
            axisLine: { lineStyle: { width: 12, color: [[1, 'rgba(0,0,0,0.06)']] } },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            detail: {
              fontSize: 28,
              fontWeight: 700,
              color: '#1D1D1F',
              offsetCenter: [0, '10%'],
              formatter: '{value}%',
            },
            title: {
              fontSize: 12,
              color: '#86868B',
              offsetCenter: [0, '40%'],
            },
            data: [{ value: data.credit_card_usage_rate, name: '用卡率' }],
          },
        ],
      }
    : null;

  // Radar option for query records
  const radarOption = data
    ? {
        radar: {
          indicator: [
            { name: '近1月', max: Math.max(data.query_records.recent_1y.loan_approval, 5) },
            { name: '近3月', max: Math.max(data.query_records.recent_1y.loan_approval, 5) },
            { name: '近6月', max: Math.max(data.query_records.recent_1y.loan_approval, 5) },
            { name: '近1年', max: Math.max(data.query_records.recent_1y.loan_approval, 5) },
          ],
          splitArea: { areaStyle: { color: ['rgba(0,0,0,0.01)', 'rgba(0,0,0,0.02)'] } },
          axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
          splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                value: [
                  data.query_records.recent_1m.loan_approval,
                  data.query_records.recent_3m.loan_approval,
                  data.query_records.recent_6m.loan_approval,
                  data.query_records.recent_1y.loan_approval,
                ],
                name: '贷款审批',
                areaStyle: { color: 'rgba(0,122,255,0.15)' },
                lineStyle: { color: '#007AFF', width: 2 },
                itemStyle: { color: '#007AFF' },
              },
            ],
          },
        ],
      }
    : null;

  // Bar chart for loan details
  const loanBarOption = data && data.institution_details.length > 0
    ? {
        grid: { left: 20, right: 20, top: 20, bottom: 24, containLabel: true },
        xAxis: {
          type: 'category' as const,
          data: data.institution_details.map((d: Record<string, unknown>) => d.type as string),
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
            type: 'bar',
            data: data.institution_details.map((d: Record<string, unknown>) => d.balance as number),
            barWidth: 32,
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#1D1D1F' },
                { offset: 1, color: '#666' },
              ]),
            },
          },
        ],
        tooltip: {
          formatter: (p: { name: string; value: number }) => `${p.name}: ${money(p.value)}`,
        },
      }
    : null;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <Title
          level={3}
          style={{ color: '#1D1D1F', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}
        >
          征信分析
        </Title>
        <Text style={{ color: '#86868B', fontSize: 14 }}>
          上传征信报告，智能提取分析关键数据
        </Text>
      </div>

      {/* Upload section */}
      {!data && (
        <div
          className="glass-card"
          style={{
            padding: 32,
            marginBottom: 24,
          }}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Input
              size="large"
              placeholder="输入客户姓名"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={!!clientId}
              style={{
                borderRadius: 12,
                background: 'rgba(0,0,0,0.03)',
                border: '1px solid rgba(0,0,0,0.06)',
                maxWidth: 360,
              }}
            />
            <FileUploader
              accept=".pdf,.jpg,.jpeg,.png"
              hint="支持 PDF 扫描件、电子版 PDF、图片格式"
              onFileSelected={handleUpload}
              loading={loading}
            />
          </Space>
        </div>
      )}

      {/* Results - Bento grid */}
      {data && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#86868B', fontSize: 13 }}>
              客户：{clientName}
            </Text>
            <Button
              size="small"
              onClick={() => {
                setData(null);
                setClientId(null);
                setClientName('');
              }}
              style={{ borderRadius: 8 }}
            >
              重新分析
            </Button>
          </div>

          <div className="bento-grid">
            {/* Total debt */}
            <div className="stat-card">
              <div className="stat-label">总负债</div>
              <div className="stat-value">{money(data.total_debt)}</div>
              <div className="stat-sub">当前未结清余额</div>
            </div>

            {/* Credit card limit */}
            <div className="stat-card">
              <div className="stat-label">信用卡额度</div>
              <div className="stat-value primary">{money(data.credit_card_total_limit)}</div>
              <div className="stat-sub">
                已用 {money(data.credit_card_used)}
              </div>
              <div className="usage-bar" style={{ marginTop: 12 }}>
                <div
                  className="usage-fill"
                  style={{
                    width: `${Math.min(data.credit_card_usage_rate, 100)}%`,
                    background:
                      data.credit_card_usage_rate > 70
                        ? '#FF3B30'
                        : data.credit_card_usage_rate > 50
                          ? '#FF9F0A'
                          : '#34C759',
                  }}
                />
              </div>
            </div>

            {/* Overdue */}
            <div className="stat-card">
              <div className="stat-label">逾期记录</div>
              <div
                className={`stat-value ${data.overdue_records.length > 0 ? 'danger' : 'success'}`}
              >
                {data.overdue_records.length > 0 ? '有逾期' : '无逾期'}
              </div>
              <div className="stat-sub">
                {data.overdue_records.length > 0
                  ? `${data.overdue_records.length} 条记录`
                  : '信用记录良好'}
              </div>
            </div>

            {/* Queries 1Y */}
            <div className="stat-card">
              <div className="stat-label">近1年查询</div>
              <div
                className={`stat-value ${data.query_records.recent_1y.loan_approval > 10 ? 'warning' : ''}`}
              >
                {data.query_records.recent_1y.loan_approval}
              </div>
              <div className="stat-sub">贷款审批查询次数</div>
            </div>

            {/* Usage gauge */}
            <div className="span-2 chart-card">
              <div className="chart-title">用卡率</div>
              {gaugeOption && (
                <ReactEChartsCore
                  echarts={echarts}
                  option={gaugeOption}
                  style={{ height: 220 }}
                />
              )}
            </div>

            {/* Query radar */}
            <div className="span-2 chart-card">
              <div className="chart-title">查询记录分布</div>
              {radarOption && (
                <ReactEChartsCore
                  echarts={echarts}
                  option={radarOption}
                  style={{ height: 220 }}
                />
              )}
            </div>

            {/* Loan bar chart */}
            {loanBarOption && (
              <div className="span-2 chart-card">
                <div className="chart-title">在贷机构余额</div>
                <ReactEChartsCore
                  echarts={echarts}
                  option={loanBarOption}
                  style={{ height: 200 }}
                />
              </div>
            )}

            {/* Query details table */}
            <div className={loanBarOption ? 'span-2 chart-card' : 'span-4 chart-card'}>
              <div className="chart-title">查询记录明细</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: '近1个月', count: data.query_records.recent_1m.loan_approval },
                  { label: '近3个月', count: data.query_records.recent_3m.loan_approval },
                  { label: '近6个月', count: data.query_records.recent_6m.loan_approval },
                  { label: '近1年', count: data.query_records.recent_1y.loan_approval },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      textAlign: 'center',
                      padding: '16px 12px',
                      background: 'rgba(0,0,0,0.02)',
                      borderRadius: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: item.count > 5 ? '#FF9F0A' : '#1D1D1F',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {item.count}
                    </div>
                    <div style={{ fontSize: 12, color: '#86868B', marginTop: 4 }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active loans list */}
            {data.active_loans && data.active_loans.length > 0 && (
              <div className="span-4 chart-card">
                <div className="chart-title">在贷明细</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.active_loans.map((loan: Record<string, unknown>, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: 'rgba(0,0,0,0.02)',
                        borderRadius: 12,
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: '#1D1D1F' }}>
                          {loan.type as string}
                        </span>
                        {loan.original_amount && (
                          <span style={{ color: '#86868B', fontSize: 13, marginLeft: 12 }}>
                            原始金额: {money(loan.original_amount as number)}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 16,
                          color: '#1D1D1F',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {money(loan.balance as number)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
