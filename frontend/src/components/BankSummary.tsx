import { Card, Col, Descriptions, Row, Statistic, Table, List } from 'antd';
import type { BankAnalysis } from '../services/api';

interface BankSummaryProps {
  data: BankAnalysis;
}

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return `${v.toFixed(2)}元`;
}

const monthColumns = [
  { title: '月份', dataIndex: 'month', key: 'month' },
  {
    title: '收入',
    dataIndex: 'income',
    key: 'income',
    render: (v: number) => fmtMoney(v),
  },
  {
    title: '支出',
    dataIndex: 'expense',
    key: 'expense',
    render: (v: number) => fmtMoney(v),
  },
  {
    title: '净收入',
    dataIndex: 'net_income',
    key: 'net_income',
    render: (v: number) => (
      <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>{fmtMoney(v)}</span>
    ),
  },
  { title: '交易笔数', dataIndex: 'transaction_count', key: 'transaction_count' },
];

export default function BankSummary({ data }: BankSummaryProps) {
  const netProfit = (data.monthly_avg_income_deduped ?? data.monthly_avg_income) - (data.monthly_avg_expense_deduped ?? data.monthly_avg_expense);

  const monthlyData = (data.monthly_summary ?? []).map((m, i) => ({
    ...m,
    key: i,
  }));

  const incomeSources = Object.entries(data.top_income_sources ?? {}).map(
    ([name, amount]) => ({ name, amount }),
  );

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="月均收入(原始)" value={fmtMoney(data.monthly_avg_income)} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="月均收入(去重)"
              value={fmtMoney(data.monthly_avg_income_deduped ?? data.monthly_avg_income)}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="月均支出" value={fmtMoney(data.monthly_avg_expense)} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="月均净利润"
              value={fmtMoney(netProfit)}
              valueStyle={{ color: netProfit >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="收支对比">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="总收入(原始)">{fmtMoney(data.total_income)}</Descriptions.Item>
              <Descriptions.Item label="总支出">{fmtMoney(data.total_expense)}</Descriptions.Item>
              <Descriptions.Item label="月均收入(去重)">{fmtMoney(data.monthly_avg_income_deduped ?? data.monthly_avg_income)}</Descriptions.Item>
              <Descriptions.Item label="月均支出(去重)">{fmtMoney(data.monthly_avg_expense_deduped ?? data.monthly_avg_expense)}</Descriptions.Item>
              <Descriptions.Item label="最低余额">{fmtMoney(data.min_balance)}</Descriptions.Item>
              <Descriptions.Item label="平均余额">{fmtMoney(data.avg_balance)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="主要收入来源">
            <List
              size="small"
              dataSource={incomeSources}
              renderItem={(item) => (
                <List.Item>
                  <span>{item.name}</span>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(item.amount)}</span>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card title="月度明细">
        <Table
          columns={monthColumns}
          dataSource={monthlyData}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
