import { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Space,
  Card,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { customersApi } from '../services/api';
import type { Customer, CustomerInput } from '../types/customer';
import CustomerStageTag from '../components/CustomerStageTag';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CustomerInput>();

  const refresh = async () => {
    setLoading(true);
    try {
      setLeads(await customersApi.list('lead'));
    } catch {
      message.error('加载意向池失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await customersApi.create({ ...values, stage: 'lead' });
      message.success('新增成功');
      form.resetFields();
      setModalOpen(false);
      refresh();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('新增失败');
    }
  };

  return (
    <Card
      title="意向池"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新增意向客户
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={leads}
        columns={[
          { title: '姓名', dataIndex: 'name' },
          { title: '电话', dataIndex: 'phone' },
          { title: '公司', dataIndex: 'company_name' },
          { title: '来源', dataIndex: 'source' },
          { title: '意向度', dataIndex: 'intent_level', render: (v) => `★ ${v}` },
          {
            title: '阶段',
            dataIndex: 'stage',
            render: (s) => <CustomerStageTag stage={s} />,
          },
          {
            title: '下次跟进',
            dataIndex: 'next_follow_up_at',
            render: (v) => (v ? new Date(v).toLocaleDateString('zh-CN') : '-'),
          },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => (window.location.hash = `#/customers/${row.id}`)}
                >
                  详情
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新增意向客户"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        okText="保存"
        cancelText="取消"
      >
        <Form layout="vertical" form={form} initialValues={{ intent_level: 3 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="company_name" label="公司名称">
            <Input />
          </Form.Item>
          <Form.Item name="source" label="来源">
            <Select
              options={[
                { label: '抖音', value: '抖音' },
                { label: '朋友介绍', value: '朋友介绍' },
                { label: '搜索', value: '搜索' },
                { label: '其他', value: '其他' },
              ]}
            />
          </Form.Item>
          <Form.Item name="intent_level" label="意向度 (1-5)">
            <InputNumber min={1} max={5} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
