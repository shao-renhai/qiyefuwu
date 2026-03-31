import { Card, Col, Descriptions, Row, Statistic, Table, Tag } from 'antd';
import type { CreditReportData } from '../services/api';

interface CreditSummaryProps {
  data: CreditReportData;
}

function fmtMoney(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toFixed(2)}元`;
}

const queryColumns = [
  { title: '时间段', dataIndex: 'period', key: 'period' },
  { title: '贷款审批', dataIndex: 'loan_approval', key: 'loan_approval' },
  { title: '法人审查', dataIndex: 'corporate_review', key: 'corporate_review' },
];

export default function CreditSummary({ data }: CreditSummaryProps) {
  const usageColor = data.credit_card_usage_rate > 70 ? '#cf1322' : undefined;
  const overdueCount = data.overdue_records?.length ?? 0;
  const recent3m = data.query_records?.recent_3m;
  const queryCount = recent3m
    ? recent3m.loan_approval + recent3m.corporate_review
    : 0;

  const queryData = [
    { key: '1m', period: '近1个月', ...(data.query_records?.recent_1m ?? { loan_approval: 0, corporate_review: 0 }) },
    { key: '3m', period: '近3个月', ...(data.query_records?.recent_3m ?? { loan_approval: 0, corporate_review: 0 }) },
    { key: '6m', period: '近6个月', ...(data.query_records?.recent_6m ?? { loan_approval: 0, corporate_review: 0 }) },
    { key: '1y', period: '近1年', ...(data.query_records?.recent_1y ?? { loan_approval: 0, corporate_review: 0 }) },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总负债" value={fmtMoney(data.total_debt)} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="信用卡使用率"
              value={data.credit_card_usage_rate}
              suffix="%"
              valueStyle={usageColor ? { color: usageColor } : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="逾期记录"
              value={overdueCount}
              suffix="条"
              valueStyle={overdueCount > 0 ? { color: '#cf1322' } : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="近3月查询次数" value={queryCount} suffix="次" />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="在贷机构">
            {data.active_loans && data.active_loans.length > 0 ? (
              data.active_loans.map((loan, i) => (
                <Descriptions key={i} column={1} size="small" bordered style={{ marginBottom: 8 }}>
                  {Object.entries(loan).map(([k, v]) => (
                    <Descriptions.Item key={k} label={k}>
                      {typeof v === 'number' ? fmtMoney(v) : String(v ?? '-')}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ))
            ) : (
              <Tag>暂无在贷记录</Tag>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="查询记录">
            <Table
              columns={queryColumns}
              dataSource={queryData}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
