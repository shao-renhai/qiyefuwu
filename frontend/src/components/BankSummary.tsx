import { Col, Row, Table } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { BankAnalysis } from '../services/api';

interface BankSummaryProps {
  data: BankAnalysis;
}

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toLocaleString()}元`;
}

function StatCard({
  label,
  value,
  color = 'primary',
}: {
  label: string;
  value: string;
  color?: 'primary' | 'success' | 'danger' | 'warning';
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
    </div>
  );
}

export default function BankSummary({ data }: BankSummaryProps) {
  const monthlyData = (data.monthly_summary ?? []).map((m, i) => ({ ...m, key: i }));

  // ── Monthly income/expense trend line chart ──
  const months = monthlyData.map((m) => m.month);
  const trendOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff' },
    },
    legend: {
      data: ['收入', '支出', '净收入'],
      textStyle: { color: 'rgba(255,255,255,0.5)' },
      top: 0,
    },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: months,
      axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        formatter: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(0)}万` : v.toString()),
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    },
    series: [
      {
        name: '收入',
        type: 'line',
        smooth: true,
        data: monthlyData.map((m) => m.income),
        lineStyle: { color: '#22c55e', width: 2 },
        itemStyle: { color: '#22c55e' },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(34,197,94,0.2)' },
              { offset: 1, color: 'rgba(34,197,94,0)' },
            ],
          },
        },
      },
      {
        name: '支出',
        type: 'line',
        smooth: true,
        data: monthlyData.map((m) => m.expense),
        lineStyle: { color: '#ef4444', width: 2 },
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(239,68,68,0.15)' },
              { offset: 1, color: 'rgba(239,68,68,0)' },
            ],
          },
        },
      },
      {
        name: '净收入',
        type: 'bar',
        data: monthlyData.map((m) => m.net),
        itemStyle: {
          color: (params: { value: number }) =>
            params.value >= 0 ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.6)',
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };

  // ── Income sources bar ──
  const incomeSources = (data.top_income_sources ?? []).slice(0, 6);
  const incomeBarOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff' },
    },
    grid: { left: 100, right: 30, top: 10, bottom: 20 },
    xAxis: {
      type: 'value' as const,
      axisLabel: {
        color: 'rgba(255,255,255,0.4)',
        formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v.toString()),
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    },
    yAxis: {
      type: 'category' as const,
      data: incomeSources.map((s) => s.counterparty).reverse(),
      axisLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        width: 80,
        overflow: 'truncate' as const,
      },
    },
    series: [
      {
        type: 'bar',
        data: incomeSources.map((s) => s.amount).reverse(),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.3)' },
              { offset: 1, color: '#3b82f6' },
            ],
          },
        },
        barWidth: 18,
      },
    ],
  };

  const monthColumns = [
    { title: '月份', dataIndex: 'month', key: 'month', width: 100 },
    { title: '收入', dataIndex: 'income', key: 'income', render: (v: number) => fmtMoney(v) },
    { title: '支出', dataIndex: 'expense', key: 'expense', render: (v: number) => fmtMoney(v) },
    {
      title: '净收入',
      dataIndex: 'net',
      key: 'net',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#22c55e' : '#ef4444', fontWeight: 500 }}>{fmtMoney(v)}</span>
      ),
    },
    { title: '笔数', dataIndex: 'tx_count', key: 'tx_count', width: 80 },
  ];

  return (
    <div>
      {/* ── Stat Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <StatCard label="月均收入(去重)" value={fmtMoney(data.deduped_monthly_avg_income)} color="success" />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="月均支出" value={fmtMoney(data.monthly_avg_expense)} color="danger" />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="月均净利润"
            value={fmtMoney(data.monthly_avg_net)}
            color={data.monthly_avg_net >= 0 ? 'success' : 'danger'}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="平均余额" value={fmtMoney(data.avg_balance)} color="primary" />
        </Col>
      </Row>

      {/* ── Trend Chart ── */}
      <div className="chart-container" style={{ marginBottom: 20 }}>
        <div className="chart-title">收支趋势</div>
        <ReactECharts option={trendOption} style={{ height: 300 }} />
      </div>

      {/* ── Income Sources + Summary ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={12}>
          <div className="chart-container" style={{ height: '100%' }}>
            <div className="chart-title">主要收入来源</div>
            {incomeSources.length > 0 ? (
              <ReactECharts option={incomeBarOption} style={{ height: 220 }} />
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 80 }}>
                暂无数据
              </div>
            )}
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="chart-container" style={{ height: '100%' }}>
            <div className="chart-title">收支汇总</div>
            <div style={{ padding: '8px 0' }}>
              {[
                ['总收入(原始)', fmtMoney(data.total_income)],
                ['总收入(去重)', fmtMoney(data.deduped_total_income)],
                ['总支出(原始)', fmtMoney(data.total_expense)],
                ['总支出(去重)', fmtMoney(data.deduped_total_expense)],
                ['最低余额', fmtMoney(data.min_balance)],
                ['日均交易笔数', data.daily_avg_tx_count?.toFixed(1) ?? '-'],
              ].map(([label, value], i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </Col>
      </Row>

      {/* ── Monthly Table ── */}
      <div className="chart-container">
        <div className="chart-title">月度明细</div>
        <Table columns={monthColumns} dataSource={monthlyData} pagination={false} size="small" />
      </div>
    </div>
  );
}
