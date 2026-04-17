import { useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  message,
  Switch,
  Row,
  Col,
  Space,
} from 'antd';
import { casesApi } from '../services/api';
import type { CaseInput } from '../types/case';

export default function CaseFormPage({ caseId }: { caseId?: number }) {
  const [form] = Form.useForm<CaseInput>();
  const isEdit = !!caseId;

  useEffect(() => {
    if (!caseId) return;
    casesApi
      .get(caseId)
      .then((c) => form.setFieldsValue(c as unknown as CaseInput))
      .catch(() => message.error('加载案例失败'));
  }, [caseId]);

  const submit = async (publish: boolean) => {
    try {
      const v = await form.validateFields();
      if (isEdit) {
        await casesApi.update(caseId!, v);
        if (publish) await casesApi.submit(caseId!);
      } else {
        const created = await casesApi.create(v);
        if (publish) await casesApi.submit(created.id);
      }
      message.success(publish ? '已提交审核' : '已保存');
      window.location.hash = '#/cases';
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('保存失败');
    }
  };

  return (
    <Card
      title={isEdit ? '编辑案例' : '新增案例'}
      extra={
        <Space>
          <Button onClick={() => submit(false)}>保存草稿</Button>
          <Button type="primary" onClick={() => submit(true)}>
            提交审核
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" form={form}>
        {/* 核心叙述 */}
        <Form.Item
          name="narrative"
          label="案例叙述（向量化的主料：讲清客户背景、来访原因、核心问题、方案、结果、核心经验）"
          rules={[{ required: true, min: 100, message: '至少 100 字' }]}
        >
          <Input.TextArea rows={10} />
        </Form.Item>

        <h3>一、客户画像</h3>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="industry"
              label="行业"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="company_size" label="规模">
              <Select
                allowClear
                options={[
                  { label: '个体', value: '个体' },
                  { label: '小微', value: '小微' },
                  { label: '中型', value: '中型' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="company_age" label="成立年限">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="credit_status" label="征信">
              <Select
                allowClear
                options={[
                  { label: '良好', value: '良好' },
                  { label: '有瑕疵', value: '有瑕疵' },
                  { label: '不良', value: '不良' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="monthly_cashflow" label="月流水 (元)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="has_tax_record"
              label="有纳税"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={8}>
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
          </Col>
          <Col span={8}>
            <Form.Item name="collateral_value" label="抵押物估值">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <h3>二、来访诉求</h3>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="visit_reason" label="来访原因">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="core_problem" label="核心问题">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="urgency" label="紧迫度">
              <Select
                allowClear
                options={[
                  { label: '紧急', value: '紧急' },
                  { label: '一般', value: '一般' },
                  { label: '不急', value: '不急' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="target_amount" label="目标额度">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <h3>三、方案</h3>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="solution_type" label="方案类型">
              <Input placeholder="如：抵押贷 / 信用贷 / 组合" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="recommended_bank" label="推荐银行">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="duration_days" label="耗时（天）">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="preparation_actions" label="准备动作/资料">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>

        <h3>四、结果</h3>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="outcome" label="结果">
              <Select
                allowClear
                options={[
                  { label: '已批', value: 'approved' },
                  { label: '被拒', value: 'rejected' },
                  { label: '客户放弃', value: 'abandoned' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="approved_amount" label="批款额度">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="actual_rate" label="实际利率 (%)">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="bank_tier" label="银行层级">
              <Select
                allowClear
                options={[
                  { label: '国有大行', value: '国有大行' },
                  { label: '股份制', value: '股份制' },
                  { label: '城商行', value: '城商行' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="core_lessons"
              label="核心经验（可重用的判断/话术）"
            >
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
