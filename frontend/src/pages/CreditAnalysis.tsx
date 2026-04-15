import { useState, useEffect, useCallback } from 'react';
import {
  Typography, Input, Button, message, Space, Tabs, Select, Card, Spin,
  Upload, Modal, InputNumber, Form, Table, Popconfirm, Tag,
  Row, Col, Statistic, Alert, Empty,
} from 'antd';
import {
  InboxOutlined, PlusOutlined, DeleteOutlined, FileSearchOutlined,
  PrinterOutlined, WarningOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, InfoCircleOutlined,
  UploadOutlined, SaveOutlined,
} from '@ant-design/icons';
import ErrorBoundary from '../components/ErrorBoundary';
import FileUploader from '../components/FileUploader';
import {
  listClients, findOrCreateClient,
  uploadCreditReport, getLatestCreditReport,
  uploadCreditImage, listCreditImages, getCreditImageUrl, deleteCreditImage,
  saveManualData, getManualData, getAnalysisReport,
} from '../services/api';
import type {
  Client, CreditReport, CreditImage, AnalysisReport,
} from '../services/api';

const { Title, Text } = Typography;
const { Dragger } = Upload;

/* ─── Helpers ─── */

function money(v: number | undefined | null): string {
  const n = v ?? 0;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab 1: Image Gallery (原件图库)
   ═══════════════════════════════════════════════════════════════════════ */

function ImageGalleryTab({ clientId }: { clientId: number }) {
  const [images, setImages] = useState<CreditImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewIdx, setPreviewIdx] = useState(0);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCreditImages(clientId);
      setImages(list);
    } catch {
      message.error('加载图片列表失败');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadImages(); }, [loadImages]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadCreditImage(clientId, file);
      message.success('上传成功');
      loadImages();
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: number) => {
    try {
      await deleteCreditImage(imageId);
      message.success('已删除');
      loadImages();
    } catch {
      message.error('删除失败');
    }
  };

  const openPreview = (idx: number) => {
    setPreviewIdx(idx);
    setPreviewUrl(getCreditImageUrl(images[idx].filename));
    setPreviewOpen(true);
  };

  const navPreview = (dir: number) => {
    const next = previewIdx + dir;
    if (next >= 0 && next < images.length) {
      setPreviewIdx(next);
      setPreviewUrl(getCreditImageUrl(images[next].filename));
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Dragger
          accept=".jpg,.jpeg,.png,.bmp,.tiff,.tif,.webp"
          multiple
          disabled={uploading}
          showUploadList={false}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          style={{ padding: '20px 0', borderRadius: 12 }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽征信报告图片到此区域</p>
          <p className="ant-upload-hint">
            支持 JPG/PNG/BMP/TIFF/WEBP，每个客户最多 100 张
          </p>
        </Dragger>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : images.length === 0 ? (
        <Empty description="暂无图片，请上传征信报告原件" />
      ) : (
        <>
          <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 12, display: 'block' }}>
            共 {images.length} 张图片
          </Text>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 12,
          }}>
            {images.map((img, idx) => (
              <div
                key={img.id}
                style={{
                  position: 'relative',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#f5f5f5',
                  aspectRatio: '3/4',
                  cursor: 'pointer',
                  border: '1px solid #eee',
                }}
              >
                <img
                  src={getCreditImageUrl(img.filename)}
                  alt={img.original_name || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onClick={() => openPreview(idx)}
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                  padding: '20px 8px 6px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.original_name || `图片${idx + 1}`}
                  </Text>
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(img.id)}>
                    <DeleteOutlined style={{ color: '#fff', fontSize: 14, cursor: 'pointer', marginLeft: 4 }} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        open={previewOpen}
        footer={
          <Space>
            <Button disabled={previewIdx <= 0} onClick={() => navPreview(-1)}>上一张</Button>
            <Text style={{ color: '#999' }}>{previewIdx + 1} / {images.length}</Text>
            <Button disabled={previewIdx >= images.length - 1} onClick={() => navPreview(1)}>下一张</Button>
          </Space>
        }
        onCancel={() => setPreviewOpen(false)}
        width="80vw"
        styles={{ body: { textAlign: 'center', padding: 12, maxHeight: '75vh', overflow: 'auto' } }}
      >
        <img src={previewUrl} alt="" style={{ maxWidth: '100%', maxHeight: '70vh' }} />
      </Modal>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Tab 2: Data Entry (数据录入)
   ═══════════════════════════════════════════════════════════════════════ */

interface InstitutionRow {
  key: string;
  name: string;
  product_type: string;
  balance: number;
  credit_limit: number;
  monthly_payment: number;
  interest_rate: number;
  due_date: string;
  status: string;
}

function DataEntryTab({ reportId, onSaved }: { reportId: number; onSaved: () => void }) {
  const [mode, setMode] = useState<'quick' | 'detail'>('quick');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);

  // Load existing data
  useEffect(() => {
    (async () => {
      try {
        const res = await getManualData(reportId);
        if (res.mode) setMode(res.mode as 'quick' | 'detail');
        if (res.manual_data) {
          const md = res.manual_data;
          form.setFieldsValue({
            total_credit_limit: md.total_credit_limit,
            total_balance: md.total_balance,
            institution_count: md.institution_count,
            credit_card_total_limit: (md.credit_cards as Record<string, unknown>)?.total_limit ?? md.credit_card_total_limit,
            credit_card_used: (md.credit_cards as Record<string, unknown>)?.used ?? md.credit_card_used,
            installment_count: (md.credit_cards as Record<string, unknown>)?.installment_count ?? 0,
            installment_balance: (md.credit_cards as Record<string, unknown>)?.installment_balance ?? 0,
            query_6m_loan: (md.query_records as Record<string, Record<string, number>>)?.recent_6m?.loan_approval ?? 0,
            query_6m_card: (md.query_records as Record<string, Record<string, number>>)?.recent_6m?.card_approval ?? 0,
            query_1y_loan: (md.query_records as Record<string, Record<string, number>>)?.recent_1y?.loan_approval ?? 0,
            query_1y_card: (md.query_records as Record<string, Record<string, number>>)?.recent_1y?.card_approval ?? 0,
          });
          if (Array.isArray(md.institutions)) {
            setInstitutions((md.institutions as InstitutionRow[]).map((inst, i) => ({
              ...inst,
              key: inst.key || `inst_${i}`,
            })));
          }
        } else if (res.parsed_data) {
          // Pre-fill from parsed data
          const pd = res.parsed_data;
          form.setFieldsValue({
            total_balance: pd.total_debt || pd.total_balance || 0,
            credit_card_total_limit: pd.credit_card_total_limit || 0,
            credit_card_used: pd.credit_card_used || 0,
          });
        }
      } catch {
        // No data yet, that's fine
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId, form]);

  const addInstitution = () => {
    setInstitutions(prev => [...prev, {
      key: `inst_${Date.now()}`,
      name: '',
      product_type: '经营贷',
      balance: 0,
      credit_limit: 0,
      monthly_payment: 0,
      interest_rate: 0,
      due_date: '',
      status: '正常',
    }]);
  };

  const updateInstitution = (key: string, field: string, value: unknown) => {
    setInstitutions(prev => prev.map(inst =>
      inst.key === key ? { ...inst, [field]: value } : inst
    ));
  };

  const removeInstitution = (key: string) => {
    setInstitutions(prev => prev.filter(inst => inst.key !== key));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const vals = form.getFieldsValue();
      const data: Record<string, unknown> = {
        total_credit_limit: vals.total_credit_limit || 0,
        total_balance: vals.total_balance || 0,
        institution_count: mode === 'quick'
          ? (vals.institution_count || 0)
          : institutions.length,
        credit_cards: {
          total_limit: vals.credit_card_total_limit || 0,
          used: vals.credit_card_used || 0,
          installment_count: vals.installment_count || 0,
          installment_balance: vals.installment_balance || 0,
        },
        query_records: {
          recent_6m: {
            loan_approval: vals.query_6m_loan || 0,
            card_approval: vals.query_6m_card || 0,
          },
          recent_1y: {
            loan_approval: vals.query_1y_loan || 0,
            card_approval: vals.query_1y_card || 0,
          },
        },
        institutions: mode === 'detail' ? institutions : [],
      };
      await saveManualData(reportId, mode, data);
      message.success('数据已保存');
      onSaved();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  const instColumns = [
    {
      title: '机构名称',
      dataIndex: 'name',
      width: 140,
      render: (_: unknown, record: InstitutionRow) => (
        <Input
          size="small"
          value={record.name}
          placeholder="如：建设银行"
          onChange={e => updateInstitution(record.key, 'name', e.target.value)}
        />
      ),
    },
    {
      title: '产品类型',
      dataIndex: 'product_type',
      width: 110,
      render: (_: unknown, record: InstitutionRow) => (
        <Select
          size="small"
          value={record.product_type}
          style={{ width: '100%' }}
          onChange={v => updateInstitution(record.key, 'product_type', v)}
          options={[
            { value: '经营贷', label: '经营贷' },
            { value: '消费贷', label: '消费贷' },
            { value: '房贷', label: '房贷' },
            { value: '车贷', label: '车贷' },
            { value: '循环贷', label: '循环贷' },
            { value: '信用贷', label: '信用贷' },
            { value: '担保贷', label: '担保贷' },
            { value: '其他', label: '其他' },
          ]}
        />
      ),
    },
    {
      title: '余额(元)',
      dataIndex: 'balance',
      width: 120,
      render: (_: unknown, record: InstitutionRow) => (
        <InputNumber
          size="small"
          value={record.balance}
          min={0}
          style={{ width: '100%' }}
          onChange={v => updateInstitution(record.key, 'balance', v ?? 0)}
        />
      ),
    },
    {
      title: '授信额度(元)',
      dataIndex: 'credit_limit',
      width: 120,
      render: (_: unknown, record: InstitutionRow) => (
        <InputNumber
          size="small"
          value={record.credit_limit}
          min={0}
          style={{ width: '100%' }}
          onChange={v => updateInstitution(record.key, 'credit_limit', v ?? 0)}
        />
      ),
    },
    {
      title: '月还款(元)',
      dataIndex: 'monthly_payment',
      width: 110,
      render: (_: unknown, record: InstitutionRow) => (
        <InputNumber
          size="small"
          value={record.monthly_payment}
          min={0}
          style={{ width: '100%' }}
          onChange={v => updateInstitution(record.key, 'monthly_payment', v ?? 0)}
        />
      ),
    },
    {
      title: '到期日',
      dataIndex: 'due_date',
      width: 110,
      render: (_: unknown, record: InstitutionRow) => (
        <Input
          size="small"
          value={record.due_date}
          placeholder="2025-12"
          onChange={e => updateInstitution(record.key, 'due_date', e.target.value)}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (_: unknown, record: InstitutionRow) => (
        <Select
          size="small"
          value={record.status}
          style={{ width: '100%' }}
          onChange={v => updateInstitution(record.key, 'status', v)}
          options={[
            { value: '正常', label: '正常' },
            { value: '逾期', label: '逾期' },
            { value: '结清', label: '结清' },
          ]}
        />
      ),
    },
    {
      title: '',
      width: 40,
      render: (_: unknown, record: InstitutionRow) => (
        <Popconfirm title="确定删除？" onConfirm={() => removeInstitution(record.key)}>
          <DeleteOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Text strong>录入模式：</Text>
          <Select
            value={mode}
            onChange={(v) => setMode(v)}
            style={{ width: 140 }}
            options={[
              { value: 'quick', label: '快速模式' },
              { value: 'detail', label: '详细模式' },
            ]}
          />
          <Text style={{ color: '#999', fontSize: 12 }}>
            {mode === 'quick' ? '仅录入汇总数据' : '逐条录入在贷机构明细'}
          </Text>
        </Space>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存数据
        </Button>
      </div>

      <Form form={form} layout="vertical" style={{ maxWidth: 900 }}>
        {/* ── 基础指标 ── */}
        <Card title="基础指标" size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="总授信额度(元)" name="total_credit_limit">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="总余额/负债(元)" name="total_balance">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            {mode === 'quick' && (
              <Col span={8}>
                <Form.Item label="在贷机构数" name="institution_count">
                  <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
                </Form.Item>
              </Col>
            )}
          </Row>
        </Card>

        {/* ── 信用卡 ── */}
        <Card title="信用卡" size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="总额度(元)" name="credit_card_total_limit">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="已用额度(元)" name="credit_card_used">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="大额分期笔数" name="installment_count">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="分期余额(元)" name="installment_balance">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── 查询记录 ── */}
        <Card title="查询记录" size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="近6月贷款审批" name="query_6m_loan">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="近6月信用卡审批" name="query_6m_card">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="近1年贷款审批" name="query_1y_loan">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="近1年信用卡审批" name="query_1y_card">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── 在贷机构明细（详细模式） ── */}
        {mode === 'detail' && (
          <Card
            title={`在贷机构明细 (${institutions.length} 家)`}
            size="small"
            style={{ marginBottom: 16, borderRadius: 12 }}
            extra={
              <Button type="dashed" icon={<PlusOutlined />} onClick={addInstitution} size="small">
                添加机构
              </Button>
            }
          >
            {institutions.length === 0 ? (
              <Empty description="暂无在贷机构，点击右上角添加" />
            ) : (
              <Table
                dataSource={institutions}
                columns={instColumns}
                pagination={false}
                size="small"
                scroll={{ x: 800 }}
                rowKey="key"
              />
            )}
          </Card>
        )}
      </Form>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Tab 3: Analysis Report (分析报告)
   ═══════════════════════════════════════════════════════════════════════ */

function AnalysisReportTab({ reportId }: { reportId: number }) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getAnalysisReport(reportId);
      setReport(r);
    } catch {
      message.error('生成分析报告失败，请先录入数据');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="正在生成分析报告..." /></div>;
  if (!report) return <Empty description="暂无分析数据，请先在「数据录入」中保存数据" />;

  const ov = report.overview;
  const riskColors = { high: '#ff4d4f', medium: '#faad14', low: '#1890ff' };
  const riskLabels = { high: '高风险', medium: '中风险', low: '低风险' };

  return (
    <div id="analysis-report-content">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {report.client_name || '客户'} · 征信分析报告
          </Title>
          <Text style={{ color: '#999', fontSize: 12 }}>
            生成时间：{new Date(report.generated_at).toLocaleString('zh-CN')}
            　|　数据来源：{report.data_source === 'manual' ? '手动录入' : report.data_source === 'auto' ? '自动解析' : '无数据'}
          </Text>
        </div>
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印报告</Button>
      </div>

      {/* ── Overview Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="总授信" value={ov.total_credit_limit} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="总余额" value={ov.total_balance} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title="负债率"
              value={ov.debt_ratio}
              suffix="%"
              valueStyle={{ color: ov.debt_ratio > 80 ? '#ff4d4f' : ov.debt_ratio > 60 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title="在贷机构"
              value={ov.institution_count}
              suffix="家"
              valueStyle={{ color: ov.institution_count > 6 ? '#ff4d4f' : ov.institution_count > 4 ? '#faad14' : '#1A1A2E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="信用卡额度" value={ov.card_limit} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title="信用卡使用率"
              value={ov.card_usage_rate}
              suffix="%"
              valueStyle={{ color: ov.card_usage_rate > 90 ? '#ff4d4f' : ov.card_usage_rate > 70 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title="近6月查询"
              value={ov.queries_6m}
              suffix="次"
              valueStyle={{ color: ov.queries_6m > 8 ? '#ff4d4f' : ov.queries_6m > 4 ? '#faad14' : '#1A1A2E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title="逾期记录"
              value={ov.overdue_count}
              suffix="条"
              valueStyle={{ color: ov.overdue_count > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Risk Summary ── */}
      <Card
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>风险预警</span>
            {report.risk_summary.high > 0 && <Tag color="red">{report.risk_summary.high} 项高风险</Tag>}
            {report.risk_summary.medium > 0 && <Tag color="orange">{report.risk_summary.medium} 项中风险</Tag>}
            {report.risk_summary.low > 0 && <Tag color="blue">{report.risk_summary.low} 项提示</Tag>}
          </Space>
        }
        size="small"
        style={{ marginBottom: 24, borderRadius: 12 }}
      >
        {report.risks.length === 0 ? (
          <Alert message="暂未发现风险项" type="success" showIcon />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {report.risks.map((risk, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: risk.level === 'high' ? '#fff2f0' : risk.level === 'medium' ? '#fffbe6' : '#e6f7ff',
                  borderLeft: `4px solid ${riskColors[risk.level]}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {risk.level === 'high' ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> :
                   risk.level === 'medium' ? <WarningOutlined style={{ color: '#faad14' }} /> :
                   <InfoCircleOutlined style={{ color: '#1890ff' }} />}
                  <Tag color={riskColors[risk.level]}>{riskLabels[risk.level]}</Tag>
                  <Text strong>{risk.title}</Text>
                </div>
                <Text style={{ color: '#666', fontSize: 13, marginLeft: 28 }}>{risk.detail}</Text>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Debt Structure ── */}
      {report.debt_structure.length > 0 && (
        <Card title="负债结构明细" size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
          <Table
            dataSource={report.debt_structure.map((d, i) => ({ ...d, key: i }))}
            columns={[
              { title: '机构', dataIndex: 'institution', width: 140 },
              { title: '产品类型', dataIndex: 'product_type', width: 100 },
              { title: '余额', dataIndex: 'balance', width: 120, render: (v: number) => money(v) },
              { title: '额度/原始金额', dataIndex: 'credit_limit', width: 130, render: (v: number) => v ? money(v) : '-' },
              { title: '月还款', dataIndex: 'monthly_payment', width: 110, render: (v: number) => v ? money(v) : '-' },
              { title: '到期日', dataIndex: 'due_date', width: 100 },
              {
                title: '状态', dataIndex: 'status', width: 80,
                render: (v: string) => (
                  <Tag color={v === '正常' ? 'green' : v === '逾期' ? 'red' : 'default'}>{v}</Tag>
                ),
              },
            ]}
            pagination={false}
            size="small"
            scroll={{ x: 700 }}
          />
        </Card>
      )}

      {/* ── Type Summary ── */}
      {Object.keys(report.type_summary).length > 0 && (
        <Card title="负债类型分布" size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
          <Row gutter={16}>
            {Object.entries(report.type_summary).map(([type, info]) => (
              <Col key={type} xs={12} sm={8} md={6}>
                <div style={{
                  padding: 16, background: '#fafafa', borderRadius: 10, textAlign: 'center', marginBottom: 12,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#C9A962' }}>{money(info.balance)}</div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{type} ({info.count}笔)</div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* ── Suggestions ── */}
      {report.suggestions.length > 0 && (
        <Card
          title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /><span>优化建议</span></Space>}
          size="small"
          style={{ borderRadius: 12 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {report.suggestions.map((s, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  background: '#f6ffed',
                  borderRadius: 10,
                  borderLeft: `4px solid ${s.priority === 'high' ? '#ff4d4f' : '#52c41a'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Tag color={s.priority === 'high' ? 'red' : 'green'}>
                    {s.priority === 'high' ? '紧急' : '建议'}
                  </Tag>
                  <Text strong>{s.category}</Text>
                </div>
                <Text style={{ color: '#333', fontSize: 13, marginLeft: 0 }}>{s.action}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Main: CreditAnalysis Page
   ═══════════════════════════════════════════════════════════════════════ */

function CreditAnalysisInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientMode, setClientMode] = useState<'select' | 'new'>('select');
  const [report, setReport] = useState<CreditReport | null>(null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('gallery');
  const [reportVersion, setReportVersion] = useState(0);

  // Load clients on mount
  useEffect(() => {
    (async () => {
      try {
        const c = await listClients();
        setClients(c);
      } catch { /* ignore */ }
      finally { setLoadingClients(false); }
    })();
  }, []);

  // Load latest report when client selected
  useEffect(() => {
    if (!selectedClientId) { setReport(null); return; }
    (async () => {
      setLoadingReport(true);
      try {
        const res = await getLatestCreditReport(selectedClientId);
        setReport(res.report as CreditReport | null);
      } catch { /* ignore */ }
      finally { setLoadingReport(false); }
    })();
  }, [selectedClientId]);

  const handleSelectClient = (clientId: number) => {
    setSelectedClientId(clientId);
    const c = clients.find(cl => cl.id === clientId);
    if (c) setClientName(c.name);
  };

  const handleCreateAndSelect = async () => {
    if (!clientName.trim()) { message.warning('请输入客户姓名'); return; }
    try {
      const c = await findOrCreateClient(clientName.trim());
      setSelectedClientId(c.id);
      // Refresh client list
      const updated = await listClients();
      setClients(updated);
      setClientMode('select');
    } catch {
      message.error('创建客户失败');
    }
  };

  const handleUploadReport = async (file: File) => {
    if (!selectedClientId) return;
    setUploading(true);
    try {
      const r = await uploadCreditReport(selectedClientId, file);
      setReport(r);
      message.success('征信报告上传成功');
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ color: '#1A1A2E', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          征信分析
        </Title>
        <Text style={{ color: '#6B7280', fontSize: 14 }}>
          上传征信报告原件，录入关键数据，生成专业分析报告
        </Text>
      </div>

      {/* ── Client Selector ── */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
        <Space wrap>
          <Text strong>选择客户：</Text>
          {clientMode === 'select' ? (
            <>
              <Select
                showSearch
                placeholder="搜索或选择客户"
                style={{ width: 200 }}
                loading={loadingClients}
                value={selectedClientId}
                onChange={handleSelectClient}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={clients.map(c => ({
                  value: c.id,
                  label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
                }))}
              />
              <Button type="link" onClick={() => setClientMode('new')}>+ 新建客户</Button>
            </>
          ) : (
            <>
              <Input
                placeholder="输入客户姓名"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                style={{ width: 160 }}
                onPressEnter={handleCreateAndSelect}
              />
              <Button type="primary" size="small" onClick={handleCreateAndSelect}>确认</Button>
              <Button size="small" onClick={() => setClientMode('select')}>取消</Button>
            </>
          )}
          {selectedClientId && !report && (
            <div style={{ marginLeft: 16 }}>
              <FileUploader
                accept=".pdf,.jpg,.jpeg,.png"
                hint="上传征信报告PDF或图片（自动解析）"
                onFileSelected={handleUploadReport}
                loading={uploading}
              />
            </div>
          )}
        </Space>
        {selectedClientId && report && (
          <div style={{ marginTop: 8 }}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text style={{ color: '#52c41a', fontSize: 13 }}>
                已有征信报告 (ID: {report.id})
              </Text>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  // Allow re-upload
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.jpg,.jpeg,.png';
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleUploadReport(f);
                  };
                  input.click();
                }}
              >
                重新上传
              </Button>
            </Space>
          </div>
        )}
      </Card>

      {/* ── Loading ── */}
      {loadingReport && (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载征信数据..." /></div>
      )}

      {/* ── Main Tabs (visible after client selected and has report) ── */}
      {selectedClientId && report && !loadingReport && (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
          items={[
            {
              key: 'gallery',
              label: '原件图库',
              children: <ImageGalleryTab clientId={selectedClientId} />,
            },
            {
              key: 'entry',
              label: '数据录入',
              children: (
                <DataEntryTab
                  reportId={report.id}
                  onSaved={() => setReportVersion(v => v + 1)}
                />
              ),
            },
            {
              key: 'report',
              label: '分析报告',
              children: <AnalysisReportTab key={reportVersion} reportId={report.id} />,
            },
          ]}
        />
      )}

      {/* ── No client selected ── */}
      {!selectedClientId && !loadingClients && (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <FileSearchOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
          <div>请先选择或新建客户，再进行征信分析</div>
        </div>
      )}

      {/* ── Client selected but no report ── */}
      {selectedClientId && !report && !loadingReport && (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <UploadOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
          <div>请先上传征信报告文件（PDF或图片）</div>
        </div>
      )}
    </div>
  );
}

export default function CreditAnalysis() {
  return (
    <ErrorBoundary>
      <CreditAnalysisInner />
    </ErrorBoundary>
  );
}
