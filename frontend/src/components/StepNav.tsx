import { Steps } from 'antd';
import { FileTextOutlined, BankOutlined, BarChartOutlined } from '@ant-design/icons';

interface StepNavProps {
  current: number;
}

const items = [
  { title: '上传征信报告', icon: <FileTextOutlined /> },
  { title: '上传银行流水', icon: <BankOutlined /> },
  { title: '查看分析报告', icon: <BarChartOutlined /> },
];

export default function StepNav({ current }: StepNavProps) {
  return (
    <Steps
      current={current}
      items={items}
      style={{ marginBottom: 32 }}
    />
  );
}
