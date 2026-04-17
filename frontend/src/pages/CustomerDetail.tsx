import { useEffect, useState } from 'react';
import {
  Card,
  Descriptions,
  Button,
  Modal,
  Form,
  Select,
  Input,
  InputNumber,
  message,
  Row,
  Col,
  Space,
} from 'antd';
import { customersApi, casesApi } from '../services/api';
import type {
  Customer,
  CustomerInteraction,
  InteractionInput,
} from '../types/customer';
import CustomerStageTag from '../components/CustomerStageTag';
import InteractionTimeline from '../components/InteractionTimeline';

export default function CustomerDetailPage({ customerId }: { customerId: number }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<CustomerInteraction[]>([]);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [iForm] = Form.useForm<InteractionInput>();
  const [cForm] = Form.useForm<{
    narrative: string;
    outcome?: string;
    approved_amount?: number;
  }>();

  const refresh = async () => {
    try {
      const [c, is] = await Promise.all([
        customersApi.get(customerId),
        customersApi.listInteractions(customerId),
      ]);
      setCustomer(c);
      setInteractions(is);
    } catch {
      message.error('加载失败');
    }
  };

  useEffect(() => {
    refresh();
  }, [customerId]);

  const addInteraction = async () => {
    try {
      const v = await iForm.validateFields();
      await customersApi.addInteraction(customerId, v);
      message.success('跟进已记录');
      iForm.resetFields();
      setInteractionOpen(false);
      refresh();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('失败');
    }
  };

  const createCase = async () => {
    try {
      const v = await cForm.validateFields();
      await casesApi.fromCustomer(customerId, v);
      message.success('案例草稿已生成，请到案例库完善');
      cForm.resetFields();
      setCaseOpen(false);
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('失败');
    }
  };

  if (!customer) return <Card loading />;

  return (
    <>
      <Row gutter={16}>
        <Col span={14}>
          <Card
            title={
              <Space>
                {customer.name} <CustomerStageTag stage={customer.stage} />
              </Space>
            }
            extra={
              <Space>
                <Button onClick={() => setInteractionOpen(true)}>添加跟进</Button>
                {(customer.stage === 'closed_won' ||
                  customer.stage === 'closed_lost') && (
                  <Button type="primary" onClick={() => setCaseOpen(true)}>
                    生成案例
                  </Button>
                )}
              </Space>
            }
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="电话">{customer.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="公司">
                {customer.company_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="行业">{customer.industry || '-'}</Descriptions.Item>
              <Descriptions.Item label="规模">
                {customer.company_size || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="意向度">★ {customer.intent_level}</Descriptions.Item>
              <Descriptions.Item label="来源">{customer.source || '-'}</Descriptions.Item>
              <Descriptions.Item label="月流水">
                {customer.monthly_cashflow
                  ? `¥${Number(customer.monthly_cashflow).toLocaleString()}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标额度">
                {customer.target_amount
                  ? `¥${Number(customer.target_amount).toLocaleString()}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="抵押物">
                {customer.collateral_type || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="征信">
                {customer.credit_status || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {customer.notes || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="跟进记录">
            <InteractionTimeline items={interactions} />
          </Card>
        </Col>
      </Row>

      <Modal
        title="添加跟进"
        open={interactionOpen}
        onCancel={() => setInteractionOpen(false)}
        onOk={addInteraction}
      >
        <Form layout="vertical" form={iForm}>
          <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '电话', value: 'phone' },
                { label: '微信', value: 'wechat' },
                { label: '到店', value: 'visit' },
                { label: '其他', value: 'other' },
              ]}
            />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="intent_level_after" label="更新意向度">
            <InputNumber min={1} max={5} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从客户生成案例"
        open={caseOpen}
        onCancel={() => setCaseOpen(false)}
        onOk={createCase}
        width={600}
      >
        <Form layout="vertical" form={cForm}>
          <Form.Item
            name="narrative"
            label="案例叙述（至少 50 字，讲清客户背景、问题、方案、结果）"
            rules={[{ required: true, min: 50 }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="outcome" label="结果">
            <Select
              options={[
                { label: '已批', value: 'approved' },
                { label: '被拒', value: 'rejected' },
                { label: '客户放弃', value: 'abandoned' },
              ]}
            />
          </Form.Item>
          <Form.Item name="approved_amount" label="批款额度（若已批）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
