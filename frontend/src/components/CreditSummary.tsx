import { Col, Row, Table, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { CreditReportData } from '../services/api';

interface CreditSummaryProps {
  data: CreditReportData;
}

function fmtMoney(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toLocaleString()}元`;
}

/** Stat card with glow accent */
function StatCard({
  label,
  value,
  color = 'primary',
}: {
  label: string;
  value: string | number;
  color?: 'primary' | 'success' | 'danger' | 'warning';
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
    </div>
  );
}

export default function CreditSummary({ data }: CreditSummaryProps) {
  const usageRate = data.credit_card_usage_rate;
  const overdueCount = data.overdue_records?.length ?? 0;
  const recent3m = data.query_records?.recent_3m;
  const queryCount = recent3m ? recent3m.loan_approval + recent3m.corporate_review : 0;

  // ── Credit card usage gauge ──
  const gaugeOption = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        progress: { show: true, width: 14, roundCap: true },
        axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(255,255,255,0.06)']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        title: { offsetCenter: [0, '30%'], fontSize: 13, color: 'rgba(255,255,255,0.5)' },
        detail: {
          fontSize: 28,
          fontWeight: 600,
          offsetCenter: [0, '-10%'],
          formatter: '{value}%',
          color: usageRate > 70 ? '#ef4444' : usageRate > 50 ? '#f59e0b' : '#22c55e',
        },
        itemStyle: {
          color: usageRate > 70 ? '#ef4444' : usageRate > 50 ? '#f59e0b' : '#3b82f6',
        },
        data: [{ value: usageRate, name: '信用卡使用率' }],
      },
    ],
  };

  // ── Query records radar ──
  const qr = data.query_records;
  const radarOption = {
    backgroundColor: 'transparent',
    radar: {
      indicator: [
        { name: '近1月', max: Math.max((qr?.recent_1y?.loan_approval ?? 0) + 2, 10) },
        { name: '近3月', max: Math.max((qr?.recent_1y?.loan_approval ?? 0) + 2, 10) },
        { name: '近6月', max: Math.max((qr?.recent_1y?.loan_approval ?? 0) + 2, 10) },
        { name: '近1年', max: Math.max((qr?.recent_1y?.loan_approval ?? 0) + 2, 10) },
      ],
      axisName: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
      splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.05)'] } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: [
              qr?.recent_1m?.loan_approval ?? 0,
              qr?.recent_3m?.loan_approval ?? 0,
              qr?.recent_6m?.loan_approval ?? 0,
              qr?.recent_1y?.loan_approval ?? 0,
            ],
            name: '贷款审批',
            areaStyle: { color: 'rgba(59,130,246,0.2)' },
            lineStyle: { color: '#3b82f6' },
            itemStyle: { color: '#3b82f6' },
          },
        ],
      },
    ],
  };

  // ── Debt composition pie ──
  const loans = data.active_loans ?? [];
  const pieData = loans.map((loan: Record<string, unknown>) => ({
    name: String(loan.type ?? '未知'),
    value: typeof loan.balance === 'number' ? loan.balance : 0,
  }));
  if (data.credit_card_used > 0) {
    pieData.push({ name: '信用卡', value: data.credit_card_used });
  }

  const pieOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    color: ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'],
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: {
          color: 'rgba(255,255,255,0.65)',
          fontSize: 12,
          formatter: '{b}\n{d}%',
        },
        labelLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        itemStyle: { borderColor: '#111827', borderWidth: 2 },
        data: pieData.length > 0 ? pieData : [{ name: '无负债', value: 1 }],
      },
    ],
  };

  // ── Query table ──
  const queryColumns = [
    { title: '时间段', dataIndex: 'period', key: 'period' },
    { title: '贷款审批', dataIndex: 'loan_approval', key: 'loan_approval' },
    { title: '法人审查', dataIndex: 'corporate_review', key: 'corporate_review' },
  ];
  const queryData = [
    { key: '1m', period: '近1个月', ...(qr?.recent_1m ?? { loan_approval: 0, corporate_review: 0 }) },
    { key: '3m', period: '近3个月', ...(qr?.recent_3m ?? { loan_approval: 0, corporate_review: 0 }) },
    { key: '6m', period: '近6个月', ...(qr?.recent_6m ?? { loan_approval: 0, corporate_review: 0 }) },
    { key: '1y', period: '近1年', ...(qr?.recent_1y ?? { loan_approval: 0, corporate_review: 0 }) },
  ];

  return (
    <div>
      {/* ── Stat Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <StatCard label="总负债" value={fmtMoney(data.total_debt)} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="信用卡使用率"
            value={`${usageRate}%`}
            color={usageRate > 70 ? 'danger' : usageRate > 50 ? 'warning' : 'success'}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label="逾期记录"
            value={`${overdueCount} 条`}
            color={overdueCount > 0 ? 'danger' : 'success'}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="近3月查询" value={`${queryCount} 次`} />
        </Col>
      </Row>

      {/* ── Charts Row ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={8}>
          <div className="chart-container">
            <div className="chart-title">信用卡使用率</div>
            <ReactECharts option={gaugeOption} style={{ height: 220 }} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="chart-container">
            <div className="chart-title">负债构成</div>
            <ReactECharts option={pieOption} style={{ height: 220 }} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="chart-container">
            <div className="chart-title">查询频率雷达</div>
            <ReactECharts option={radarOption} style={{ height: 220 }} />
          </div>
        </Col>
      </Row>

      {/* ── Detail Tables ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <div className="chart-title">在贷明细</div>
            {loans.length > 0 ? (
              <div>
                {loans.map((loan: Record<string, unknown>, i: number) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <Tag color="blue">{String(loan.type ?? '未知')}</Tag>
                    <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                      {typeof loan.balance === 'number' ? fmtMoney(loan.balance) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.3)', padding: 20, textAlign: 'center' }}>
                暂无在贷记录
              </div>
            )}
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <div className="chart-title">查询记录统计</div>
            <Table
              columns={queryColumns}
              dataSource={queryData}
              pagination={false}
              size="small"
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}
