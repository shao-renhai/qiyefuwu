import { Steps } from 'antd';
import { SafetyCertificateOutlined, BankOutlined, BarChartOutlined } from '@ant-design/icons';

interface StepNavProps {
  current: number;
}

const items = [
  { title: '征信报告', icon: <SafetyCertificateOutlined /> },
  { title: '银行流水', icon: <BankOutlined /> },
  { title: '分析报告', icon: <BarChartOutlined /> },
];

export default function StepNav({ current }: StepNavProps) {
  return (
    <div className="step-nav" style={{ marginBottom: 28 }}>
      <Steps current={current} items={items} />
    </div>
  );
}
