import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Space,
  Tag,
  Modal,
  Input,
  message,
  Drawer,
  Descriptions,
  Popconfirm,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { casesApi } from '../services/api';
import type { Case, CaseStatus } from '../types/case';
import CaseStatusTag from '../components/CaseStatusTag';

export default function CasesPage({ role }: { role: string }) {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | undefined>();
  const [industryFilter, setIndustryFilter] = useState<string | undefined>();
  const [drawerCase, setDrawerCase] = useState<Case | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setCases(
        await casesApi.list({ status: statusFilter, industry: industryFilter }),
      );
    } catch {
      message.error('加载案例失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [statusFilter, industryFilter]);

  const isFounder = role === 'founder';

  const submit = async (id: number) => {
    try {
      await casesApi.submit(id);
      message.success('已提交');
      refresh();
    } catch {
      message.error('提交失败');
    }
  };
  const publish = async (id: number) => {
    try {
      await casesApi.publish(id);
      message.success('已发布');
      refresh();
    } catch {
      message.error('发布失败');
    }
  };
  const archive = async (id: number) => {
    try {
      await casesApi.archive(id);
      message.success('已归档');
      refresh();
    } catch {
      message.error('归档失败');
    }
  };
  const openReject = (id: number) => {
    setRejectTarget(id);
    setRejectNotes('');
    setRejectOpen(true);
  };
  const confirmReject = async () => {
    if (!rejectTarget || !rejectNotes) {
      message.warning('请填写意见');
      return;
    }
    try {
      await casesApi.reject(rejectTarget, rejectNotes);
      message.success('已打回');
      setRejectOpen(false);
      refresh();
    } catch {
      message.error('操作失败');
    }
  };
  const remove = async (id: number) => {
    try {
      await casesApi.remove(id);
      message.success('已删除');
      refresh();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <>
      <Card
        title="案例库"
        extra={
          <Space>
            <Select
              allowClear
              placeholder="状态"
              style={{ width: 120 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: '草稿', value: 'draft' },
                { label: '待审核', value: 'pending_review' },
                { label: '已发布', value: 'published' },
                { label: '已归档', value: 'archived' },
              ]}
            />
            <Input
              allowClear
              placeholder="按行业过滤"
              style={{ width: 160 }}
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value || undefined)}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => (window.location.hash = '#/cases/new')}
            >
              新增案例
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={cases}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 70 },
            {
              title: '叙述',
              dataIndex: 'narrative',
              render: (v: string) =>
                v ? v.slice(0, 60) + (v.length > 60 ? '...' : '') : '-',
            },
            { title: '行业', dataIndex: 'industry' },
            {
              title: '结果',
              dataIndex: 'outcome',
              render: (v) => (v ? <Tag>{v}</Tag> : '-'),
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (s) => <CaseStatusTag status={s} />,
            },
            { title: '层级', dataIndex: 'tier' },
            {
              title: '操作',
              width: 300,
              render: (_, row) => (
                <Space wrap>
                  <Button size="small" onClick={() => setDrawerCase(row)}>
                    查看
                  </Button>
                  {row.status === 'draft' && (
                    <>
                      <Button
                        size="small"
                        onClick={() =>
                          (window.location.hash = `#/cases/${row.id}/edit`)
                        }
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => submit(row.id)}
                      >
                        提交审核
                      </Button>
                      <Popconfirm
                        title="确定删除？"
                        onConfirm={() => remove(row.id)}
                      >
                        <Button size="small" danger>
                          删除
                        </Button>
                      </Popconfirm>
                    </>
                  )}
                  {isFounder && row.status === 'pending_review' && (
                    <>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => publish(row.id)}
                      >
                        发布
                      </Button>
                      <Button size="small" onClick={() => openReject(row.id)}>
                        打回
                      </Button>
                    </>
                  )}
                  {isFounder && row.status === 'published' && (
                    <Button
                      size="small"
                      danger
                      onClick={() => archive(row.id)}
                    >
                      归档
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={drawerCase ? `案例 #${drawerCase.id}` : ''}
        width={640}
        open={!!drawerCase}
        onClose={() => setDrawerCase(null)}
      >
        {drawerCase && (
          <>
            <p style={{ whiteSpace: 'pre-wrap' }}>{drawerCase.narrative}</p>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="行业">
                {drawerCase.industry}
              </Descriptions.Item>
              <Descriptions.Item label="规模">
                {drawerCase.company_size || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="月流水">
                {drawerCase.monthly_cashflow ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="征信">
                {drawerCase.credit_status || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="抵押物">
                {drawerCase.collateral_type || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标额度">
                {drawerCase.target_amount ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="方案类型">
                {drawerCase.solution_type || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="推荐银行">
                {drawerCase.recommended_bank || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="结果">
                {drawerCase.outcome || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="批款">
                {drawerCase.approved_amount ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="实际利率">
                {drawerCase.actual_rate ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="银行层级">
                {drawerCase.bank_tier || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="核心经验" span={2}>
                {drawerCase.core_lessons || '-'}
              </Descriptions.Item>
              {drawerCase.review_notes && (
                <Descriptions.Item label="审核意见" span={2}>
                  {drawerCase.review_notes}
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Drawer>

      <Modal
        title="打回案例"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={confirmReject}
      >
        <Input.TextArea
          rows={4}
          placeholder="请写清打回原因"
          value={rejectNotes}
          onChange={(e) => setRejectNotes(e.target.value)}
        />
      </Modal>
    </>
  );
}
