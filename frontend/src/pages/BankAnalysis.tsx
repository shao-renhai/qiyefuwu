import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography, Input, Button, message, Space, Tabs, Select, Card, Spin,
  InputNumber, Form, Table, Popconfirm, Tag, Empty,
  Row, Col, Statistic, Alert, Tooltip, Descriptions, Collapse,
} from 'antd';
import {
  BankOutlined, DeleteOutlined, PrinterOutlined,
  WarningOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, InfoCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import FileUploader from '../components/FileUploader';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  listClients, findOrCreateClient,
  uploadBankStatement, listClientStatements, deleteBankStatement,
  getBankContext, saveBankContext, getBankDiagnosisReport,
} from '../services/api';
import type {
  Client, BankStatementSummary, BankContext, BankDiagnosisReport, AnnualOverview,
} from '../services/api';

const { Title, Text } = Typography;

/* ─── Helpers ─── */

function money(v: number | undefined | null): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function ratioColor(v: number | null, healthy: number, warn: number, higherBetter = true): string {
  if (v === null || v === undefined) return '#9CA3AF';
  if (higherBetter) {
    if (v >= healthy) return '#36B37E';
    if (v >= warn) return '#FAAD14';
    return '#FF5630';
  }
  if (v <= healthy) return '#36B37E';
  if (v <= warn) return '#FAAD14';
  return '#FF5630';
}


/* ─── AnnualOverviewCard ─── */

function AnnualOverviewCard({ data }: { data: AnnualOverview }) {
  if (!data || data.window_months === 0) {
    return (
      <Card style={{ borderRadius: 12, marginBottom: 24, background: '#FAFAFA' }}>
        <div style={{ padding: 16, color: '#8C8C8C' }}>暂无流水数据，无法计算年营业额。</div>
      </Card>
    );
  }

  const moneyFull = (v: number) => `¥ ${v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  const isPartial = data.is_annualized;
  const hasFullExtra = data.full_window_months > 12 && data.full_window_revenue > data.annual_revenue;

  return (
    <Card style={{ borderRadius: 12, marginBottom: 24, background: 'linear-gradient(135deg,#F0F5FF 0%,#E6FFFB 100%)' }}>
      <Row gutter={24} align="middle">
        <Col flex="auto">
          <div style={{ color: '#595959', fontSize: 14, marginBottom: 4 }}>
            {isPartial ? `近 ${data.window_months} 月业务性累计` : '近 12 月年营业额（业务性）'}
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#1A1A2E' }}>
            {moneyFull(data.annual_revenue)}
          </div>
          {isPartial && data.annualized_hint && (
            <div style={{ color: '#FA8C16', fontSize: 13, marginTop: 4 }}>{data.annualized_hint}</div>
          )}
        </Col>
        <Col>
          <div style={{ padding: '6px 14px', background: '#fff', borderRadius: 16, color: '#2F54EB', fontWeight: 500 }}>
            体量段位：{data.size_tier_label}
          </div>
        </Col>
      </Row>

      <div style={{ marginTop: 12, color: '#8C8C8C', fontSize: 13 }}>
        数据窗口：{data.window_start} ~ {data.window_end}（共 {data.window_months} 月）&nbsp;·&nbsp;
        月均进账：{moneyFull(data.monthly_avg_income)}
        {hasFullExtra && (
          <span>&nbsp;·&nbsp;全周期 {data.full_window_months} 月累计：{moneyFull(data.full_window_revenue)}</span>
        )}
      </div>

      <Collapse
        ghost
        size="small"
        style={{ marginTop: 8 }}
        items={[{
          key: 'detail',
          label: '展开：账面 vs 业务性 vs 剔除率',
          children: (
            <Descriptions size="small" column={{ xs: 1, sm: 3 }} bordered={false}>
              <Descriptions.Item label="账面累计">{moneyFull(data.annual_revenue_raw)}</Descriptions.Item>
              <Descriptions.Item label="业务性累计">{moneyFull(data.annual_revenue)}</Descriptions.Item>
              <Descriptions.Item label="自转/提现剔除">
                {moneyFull(data.self_transfer_amount)}（{(data.self_transfer_ratio * 100).toFixed(1)}%）
              </Descriptions.Item>
            </Descriptions>
          ),
        }]}
      />
    </Card>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Tab 1: 流水上传管理
   ═══════════════════════════════════════════════════════════════════════ */

function StatementsTab({
  clientId, clientName, onChanged,
}: {
  clientId: number; clientName: string; onChanged: () => void;
}) {
  const [list, setList] = useState<BankStatementSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bankName, setBankName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await listClientStatements(clientId));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadBankStatement(clientId, file, clientName, bankName || undefined);
      message.success('流水上传并解析完成');
      setBankName('');
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      message.error(e.response?.data?.detail || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBankStatement(id);
      message.success('已删除');
      await load();
      onChanged();
    } catch { message.error('删除失败'); }
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space size="middle">
            <Input
              placeholder="银行名称（选填，如 工行/建行/支付宝）"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              style={{ width: 260 }}
            />
            <Text style={{ color: '#999', fontSize: 12 }}>
              同一银行重复上传会替换旧流水；不同银行会并存
            </Text>
          </Space>
          <FileUploader
            accept=".xlsx,.xls,.csv,.pdf"
            hint="支持 Excel / CSV / PDF 银行流水（可多次上传合并分析）"
            onFileSelected={handleUpload}
            loading={uploading}
          />
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : list.length === 0 ? (
        <Empty description="暂无流水，请上传" />
      ) : (
        <Table
          dataSource={list.map((s) => ({ ...s, key: s.id }))}
          pagination={false}
          size="small"
          columns={[
            { title: '银行', dataIndex: 'bank_name', render: (v: string | null) => v || <Text type="secondary">未填</Text> },
            { title: '交易笔数', dataIndex: 'tx_count', width: 100 },
            {
              title: '上传时间', dataIndex: 'created_at', width: 160,
              render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
            },
            {
              title: '操作', width: 80,
              render: (_: unknown, r: BankStatementSummary) => (
                <Popconfirm title="确定删除该条流水？" onConfirm={() => handleDelete(r.id)}>
                  <DeleteOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }} />
                </Popconfirm>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Tab 2: 补录数据（目标贷款金额 + 现有月还款）
   ═══════════════════════════════════════════════════════════════════════ */

function ContextTab({ clientId, onSaved }: { clientId: number; onSaved: () => void }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggested, setSuggested] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctx: BankContext = await getBankContext(clientId);
      form.setFieldsValue({
        target_loan_amount: ctx.target_loan_amount,
        existing_monthly_payment:
          ctx.existing_monthly_payment ?? ctx.suggested_monthly_payment ?? null,
      });
      setSuggested(ctx.suggested_monthly_payment);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clientId, form]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const vals = form.getFieldsValue();
      await saveBankContext(clientId, {
        target_loan_amount: vals.target_loan_amount ?? null,
        existing_monthly_payment: vals.existing_monthly_payment ?? null,
      });
      message.success('已保存');
      onSaved();
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
      <Card title="申贷与负债补录" size="small" style={{ borderRadius: 12 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="目标贷款金额（元）"
              name="target_loan_amount"
              tooltip="用于计算「月均流水 / 目标贷款」比例（银行 10 倍覆盖原则）"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={10000} placeholder="如 2000000" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={
                <Space size={4}>
                  <span>现有贷款月还款总额（元）</span>
                  {suggested !== null && (
                    <Tooltip title={`已从最新征信自动预填合计 ${money(suggested)} 元，可修改`}>
                      <InfoCircleOutlined style={{ color: '#1890ff' }} />
                    </Tooltip>
                  )}
                </Space>
              }
              name="existing_monthly_payment"
              tooltip="所有在贷机构月还款之和。用于计算流水覆盖率"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={100} placeholder="0" />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存
        </Button>
      </Card>
    </Form>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Tab 3: 合并诊断报告（打印目标页）
   ═══════════════════════════════════════════════════════════════════════ */

function DiagnosisReportTab({ clientId }: { clientId: number }) {
  const [report, setReport] = useState<BankDiagnosisReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getBankDiagnosisReport(clientId));
    } catch { message.error('生成报告失败，请先上传流水'); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="生成合并诊断报告..." /></div>;
  if (!report) return <Empty description="暂无数据" />;

  const r = report;
  const ov = r.overview;
  const ra = r.ratios;
  const T = r.thresholds;

  const riskColors: Record<string, string> = {
    high: '#ff4d4f', medium: '#faad14', low: '#1890ff',
  };
  const riskLabels: Record<string, string> = {
    high: '高风险', medium: '中风险', low: '提示',
  };

  return (
    <div id="bank-diagnosis-report">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {r.client_name}{r.client_company ? ` · ${r.client_company}` : ''} · 流水合并分析报告
          </Title>
          <Text style={{ color: '#999', fontSize: 12 }}>
            生成时间：{new Date(r.generated_at).toLocaleString('zh-CN')}
            　|　账户数：{r.account_count}
            {r.banks.length > 0 && ` 　|　银行：${r.banks.join(' / ')}`}
          </Text>
        </div>
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印报告</Button>
      </div>

      {/* ── 年营业额总览 ── */}
      {r.annual_overview && <AnnualOverviewCard data={r.annual_overview} />}

      {/* ── 三大比率卡片 ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title={<Tooltip title="月均流入 / 月均月供，应 ≥ 1.5">流水覆盖率</Tooltip>}
              value={ra.coverage_ratio ?? '—'}
              suffix={ra.coverage_ratio !== null ? '倍' : ''}
              precision={ra.coverage_ratio !== null ? 2 : undefined}
              valueStyle={{
                color: ratioColor(ra.coverage_ratio, T.coverage?.healthy ?? 2, T.coverage?.warn ?? 1.5),
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title={<Tooltip title="月均净流入 / 月均流入，应 ≥ 15%">收支平衡率</Tooltip>}
              value={ra.balance_ratio !== null ? ra.balance_ratio * 100 : '—'}
              suffix={ra.balance_ratio !== null ? '%' : ''}
              precision={ra.balance_ratio !== null ? 1 : undefined}
              valueStyle={{
                color: ratioColor(ra.balance_ratio, T.balance?.healthy ?? 0.2, T.balance?.warn ?? 0.1),
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic
              title={<Tooltip title="std(月流入) / mean(月流入)，越低越稳，应 ≤ 0.3">流水波动系数</Tooltip>}
              value={ra.volatility_coef ?? '—'}
              precision={ra.volatility_coef !== null ? 2 : undefined}
              valueStyle={{
                color: ratioColor(
                  ra.volatility_coef,
                  T.volatility?.healthy ?? 0.3,
                  T.volatility?.warn ?? 0.5,
                  false,
                ),
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            {(() => {
              const lcr = ra.loan_coverage_ratio ?? ra.loan_cover_ratio ?? null;
              const has = lcr !== null && lcr !== undefined;
              return (
                <Statistic
                  title={<Tooltip title="目标贷款 / 年营业额，银行标准应 ≤ 30%（越小越稳）">贷款覆盖率</Tooltip>}
                  value={has ? lcr! * 100 : '—'}
                  suffix={has ? '%' : ''}
                  precision={has ? 1 : undefined}
                  valueStyle={{
                    color: ratioColor(
                      lcr,
                      T.loan_coverage?.healthy ?? 0.30,
                      T.loan_coverage?.warn ?? 0.80,
                      false,
                    ),
                  }}
                />
              );
            })()}
          </Card>
        </Col>
      </Row>

      {/* ── 流水总览卡片 ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="月均流入（去重）" value={ov.monthly_avg_income} formatter={(v) => money(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="月均净流入" value={ov.monthly_avg_net} formatter={(v) => money(Number(v))}
              valueStyle={{ color: ov.monthly_avg_net >= 0 ? '#36B37E' : '#FF5630' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="最低余额" value={ov.min_balance} formatter={(v) => money(Number(v))}
              valueStyle={{ color: ov.min_balance <= 0 ? '#FF5630' : '#1A1A2E' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
            <Statistic title="月均交易笔数" value={ov.monthly_avg_tx_count} precision={0} />
          </Card>
        </Col>
      </Row>

      {/* ── 风险预警 ── */}
      <Card
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>风险预警</span>
            {r.risk_summary.high > 0 && <Tag color="red">{r.risk_summary.high} 项高风险</Tag>}
            {r.risk_summary.medium > 0 && <Tag color="orange">{r.risk_summary.medium} 项中风险</Tag>}
            {r.risk_summary.low > 0 && <Tag color="blue">{r.risk_summary.low} 项提示</Tag>}
          </Space>
        }
        size="small"
        style={{ marginBottom: 24, borderRadius: 12 }}
      >
        {r.risks.length === 0 ? (
          <Alert message="暂未发现风险项，流水结构健康" type="success" showIcon />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.risks.map((risk, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background:
                    risk.level === 'high' ? '#fff2f0' :
                    risk.level === 'medium' ? '#fffbe6' : '#e6f7ff',
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

      {/* ── 月度收支明细 ── */}
      {r.monthly_summary.length > 0 && (
        <Card title="月度收支明细" size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
          <Table
            dataSource={r.monthly_summary.map((m, i) => ({ ...m, key: i }))}
            columns={[
              { title: '月份', dataIndex: 'month', width: 100 },
              { title: '收入', dataIndex: 'income', render: (v: number) => money(v) },
              { title: '支出', dataIndex: 'expense', render: (v: number) => money(v) },
              {
                title: '净额', dataIndex: 'net',
                render: (v: number) => (
                  <span style={{ color: v >= 0 ? '#36B37E' : '#FF5630', fontWeight: 600 }}>{money(v)}</span>
                ),
              },
              { title: '笔数', dataIndex: 'tx_count', width: 80 },
            ]}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {/* ── Top5 对手方 ── */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title="Top 5 收入对手方" size="small" style={{ borderRadius: 12 }}>
            {r.top_income_sources.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.top_income_sources.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: '#fafafa', borderRadius: 8,
                  }}>
                    <Text>{s.counterparty || '未知'}</Text>
                    <Space>
                      <Text strong style={{ color: '#36B37E' }}>{money(s.amount)}</Text>
                      <Tag color={s.ratio > 50 ? 'red' : s.ratio > 30 ? 'orange' : 'default'}>
                        {pct(s.ratio / 100)}
                      </Tag>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Top 5 支出对手方" size="small" style={{ borderRadius: 12 }}>
            {r.top_expense_categories.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.top_expense_categories.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: '#fafafa', borderRadius: 8,
                  }}>
                    <Text>{s.counterparty || '未知'}</Text>
                    <Space>
                      <Text strong style={{ color: '#FF5630' }}>{money(s.amount)}</Text>
                      <Tag>{pct(s.ratio / 100)}</Tag>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 优化建议 ── */}
      {r.suggestions.length > 0 && (
        <Card
          title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /><span>优化建议</span></Space>}
          size="small"
          style={{ borderRadius: 12 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.suggestions.map((s, i) => (
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
                <Text style={{ color: '#333', fontSize: 13 }}>{s.action}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Main: 客户选择 + 三 Tab
   ═══════════════════════════════════════════════════════════════════════ */

function BankAnalysisInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientMode, setClientMode] = useState<'select' | 'new'>('select');
  const [activeTab, setActiveTab] = useState('upload');
  const [loadingClients, setLoadingClients] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    (async () => {
      try { setClients(await listClients()); }
      catch { /* ignore */ }
      finally { setLoadingClients(false); }
    })();
  }, []);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId],
  );

  const handleSelect = (id: number) => {
    setSelectedClientId(id);
    const c = clients.find((cl) => cl.id === id);
    if (c) setClientName(c.name);
  };

  const handleCreate = async () => {
    if (!clientName.trim()) { message.warning('请输入客户姓名'); return; }
    try {
      const c = await findOrCreateClient(clientName.trim());
      setSelectedClientId(c.id);
      const updated = await listClients();
      setClients(updated);
      setClientMode('select');
      setActiveTab('upload');
    } catch { message.error('创建客户失败'); }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ color: '#1A1A2E', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          流水分析
        </Title>
        <Text style={{ color: '#6B7280', fontSize: 14 }}>
          合并该客户所有银行账户流水，生成三大健康比率 + 风险诊断报告（可打印 A4）
        </Text>
      </div>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
        <Space wrap>
          <Text strong>选择客户：</Text>
          {clientMode === 'select' ? (
            <>
              <Select
                showSearch
                placeholder="搜索或选择客户"
                style={{ width: 240 }}
                loading={loadingClients}
                value={selectedClientId}
                onChange={handleSelect}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={clients.map((c) => ({
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
                onChange={(e) => setClientName(e.target.value)}
                onPressEnter={handleCreate}
                style={{ width: 200 }}
              />
              <Button type="primary" size="small" onClick={handleCreate}>确认</Button>
              <Button size="small" onClick={() => setClientMode('select')}>取消</Button>
            </>
          )}
        </Space>
      </Card>

      {selectedClient ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
          items={[
            {
              key: 'upload',
              label: <Space><BankOutlined />流水上传</Space>,
              children: (
                <StatementsTab
                  clientId={selectedClient.id}
                  clientName={selectedClient.name}
                  onChanged={() => setVersion((v) => v + 1)}
                />
              ),
            },
            {
              key: 'context',
              label: '补录数据',
              children: (
                <ContextTab
                  clientId={selectedClient.id}
                  onSaved={() => setVersion((v) => v + 1)}
                />
              ),
            },
            {
              key: 'report',
              label: '分析报告',
              children: (
                <DiagnosisReportTab key={version} clientId={selectedClient.id} />
              ),
            },
          ]}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <BankOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
          <div>请先选择或新建客户</div>
        </div>
      )}
    </div>
  );
}

export default function BankAnalysis() {
  return (
    <ErrorBoundary>
      <BankAnalysisInner />
    </ErrorBoundary>
  );
}
