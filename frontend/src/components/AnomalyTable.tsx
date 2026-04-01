import { Table, Tag } from 'antd';
import type { AnomalyItem } from '../services/api';

interface AnomalyTableProps {
  data: AnomalyItem[];
}

const typeLabels: Record<string, { text: string; color: string }> = {
  large_amount: { text: '大额交易', color: 'red' },
  round_number: { text: '整数交易', color: 'orange' },
  regular_pattern: { text: '规律交易', color: 'blue' },
};

const columns = [
  { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
  { title: '交易对手', dataIndex: 'counterparty', key: 'counterparty' },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    render: (v: number) => v.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }),
  },
  {
    title: '方向',
    dataIndex: 'direction',
    key: 'direction',
    width: 80,
    render: (v: string) => (
      <Tag color={v === '收入' || v === 'income' ? 'green' : 'red'}>
        {v === 'income' ? '收入' : v === 'expense' ? '支出' : v}
      </Tag>
    ),
  },
  {
    title: '异常类型',
    dataIndex: 'type',
    key: 'type',
    width: 110,
    render: (v: string) => {
      const cfg = typeLabels[v] ?? { text: v, color: 'default' };
      return <Tag color={cfg.color}>{cfg.text}</Tag>;
    },
  },
  { title: '说明', dataIndex: 'description', key: 'description' },
];

export default function AnomalyTable({ data }: AnomalyTableProps) {
  const rows = data.map((r, i) => ({ ...r, key: i }));
  return (
    <Table
      columns={columns}
      dataSource={rows}
      pagination={{ pageSize: 10 }}
      size="small"
    />
  );
}
