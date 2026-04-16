import { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  message,
  Card,
  Space,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { customersApi } from '../services/api';
import type { Customer, CustomerInput, CustomerStage } from '../types/customer';
import CustomerStageTag from '../components/CustomerStageTag';

const STAGE_OPTIONS: { label: string; value: CustomerStage }[] = [
  { label: '已邀约', value: 'invited' },
  { label: '接待中', value: 'consulting' },
  { label: '方案中', value: 'proposal' },
  { label: '已成交', value: 'closed_won' },
  { label: '已流失', value: 'closed_lost' },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CustomerInput>();

  const refresh = async () => {
    setLoading(true);
    try {
      setCustomers(await customersApi.list(stageFilter));
    } catch {
      message.error('加载客户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [stageFilter]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await customersApi.create(values);
      message.success('新增成功');
      form.resetFields();
      setModalOpen(false);
      refresh();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('新增失败');
    }
  };

  // 接待入口：只展示非 lead 阶段（意向池在 Leads 页）
  const visible = customers.filter((c) => c.stage !== 'lead');

  return (
    <Card
      title="我的客户"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="按阶段筛选"
            style={{ width: 140 }}
            value={stageFilter}
            onChange={setStageFilter}
            options={STAGE_OPTIONS}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增接待客户
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={visible}
        columns={[
          { title: '姓名', dataIndex: 'name' },
          { title: '公司', dataIndex: 'company_name' },
          { title: '行业', dataIndex: 'industry' },
          {
            title: '月流水',
            dataIndex: 'monthly_cashflow',
            render: (v) => (v ? `¥${Number(v).toLocaleString()}` : '-'),
          },
          {
            title: '目标额度',
            dataIndex: 'target_amount',
            render: (v) => (v ? `¥${Number(v).toLocaleString()}` : '-'),
          },
          {
            title: '阶段',
            dataIndex: 'stage',
            render: (s) => <CustomerStageTag stage={s} />,
          },
          {
            title: '操作',
            render: (_, row) => (
              <Button
                size="small"
                onClick={() => (window.location.hash = `#/customers/${row.id}`)}
              >
                详情
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="新增接待客户"
        open={modalOpen}
        width={720}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        okText="保存"
        cancelText="取消"
      >
        <Form
          layout="vertical"
          form={form}
          initialValues={{ stage: 'consulting', intent_level: 4 }}
        >
          <Form.Item name="name" label="联系人" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="company_name" label="公司名称">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="stage" label="阶段">
            <Select options={STAGE_OPTIONS} />
          </Form.Item>
          <Form.Item name="industry" label="行业">
            <Input />
          </Form.Item>
          <Form.Item name="company_size" label="企业规模">
            <Select
              options={[
                { label: '个体', value: '个体' },
                { label: '小微', value: '小微' },
                { label: '中型', value: '中型' },
              ]}
            />
          </Form.Item>
          <Form.Item name="company_age" label="成立年限">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="monthly_cashflow" label="月流水 (元)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="has_tax_record" label="有纳税记录" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="collateral_type" label="抵押物类型">
            <Select
              allowClear
              options={[
                { label: '无', value: '无' },
                { label: '房产', value: '房产' },
                { label: '车辆', value: '车辆' },
                { label: '设备', value: '设备' },
              ]}
            />
          </Form.Item>
          <Form.Item name="target_amount" label="目标额度 (元)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
