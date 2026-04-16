import { Tag } from 'antd';
import type { CaseStatus } from '../types/case';

const STATUS_CONFIG: Record<CaseStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  pending_review: { color: 'orange', label: '待审核' },
  published: { color: 'green', label: '已发布' },
  archived: { color: 'red', label: '已归档' },
};

export default function CaseStatusTag({ status }: { status: CaseStatus }) {
  const cfg = STATUS_CONFIG[status] || { color: 'default', label: status };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}
