import { Tag } from 'antd';
import type { CustomerStage } from '../types/customer';

const STAGE_CONFIG: Record<CustomerStage, { color: string; label: string }> = {
  lead: { color: 'default', label: '意向' },
  invited: { color: 'blue', label: '已邀约' },
  consulting: { color: 'cyan', label: '接待中' },
  proposal: { color: 'orange', label: '方案中' },
  closed_won: { color: 'green', label: '已成交' },
  closed_lost: { color: 'red', label: '已流失' },
};

export default function CustomerStageTag({ stage }: { stage: CustomerStage }) {
  const cfg = STAGE_CONFIG[stage] || { color: 'default', label: stage };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}
