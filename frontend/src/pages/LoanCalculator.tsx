import { useState } from 'react';
import { Typography, Form, Input, Select, Button, Row, Col, Segmented, Table } from 'antd';
import { CalculatorOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

function money(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ScheduleItem {
  key: number;
  month: number;
  payment: number;
  principal: number;
  interest: number;
  remaining: number;
}

interface LoanResultData {
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
  schedule: ScheduleItem[];
}

export default function LoanCalculator() {
  const [mode, setMode] = useState<'estimate' | 'loan'>('estimate');
  const [estimateForm] = Form.useForm();
  const [loanForm] = Form.useForm();
  const [estimateResult, setEstimateResult] = useState<{ min: number; max: number } | null>(null);
  const [loanResult, setLoanResult] = useState<LoanResultData | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  const onEstimate = (values: { revenue: string; taxLevel: string; hasInvoice: boolean }) => {
    const revenueRanges: Record<string, [number, number]> = {
      '100-300': [50, 100],
      '300-500': [100, 200],
      '500-1000': [200, 500],
      '1000+': [500, 1000],
    };
    const taxCoeffs: Record<string, number> = {
      'A级': 1.5, 'B级': 1.2, 'C级': 0.8, '未评级': 0.5,
    };
    const [minBase, maxBase] = revenueRanges[values.revenue] || [50, 100];
    const coeff = taxCoeffs[values.taxLevel] || 0.8;
    const bonus = values.hasInvoice ? 1.2 : 1.0;
    setEstimateResult({
      min: Math.round(minBase * coeff * bonus),
      max: Math.round(maxBase * coeff * bonus),
    });
  };

  const onLoan = (values: { amount: number; term: number; rate: number; repaymentType: string }) => {
    const principal = values.amount * 10000;
    const monthlyRate = values.rate / 100 / 12;
    const months = values.term;
    const schedule: ScheduleItem[] = [];
    let remaining = principal;
    let totalPayment = 0;

    if (values.repaymentType === 'equalinstallment') {
      // 等额本息
      const mp = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
      for (let i = 1; i <= months; i++) {
        const interest = remaining * monthlyRate;
        const prinPart = mp - interest;
        remaining -= prinPart;
        totalPayment += mp;
        schedule.push({
          key: i,
          month: i,
          payment: mp,
          principal: prinPart,
          interest,
          remaining: Math.max(remaining, 0),
        });
      }
      setLoanResult({
        monthlyPayment: mp / 10000,
        totalInterest: (totalPayment - principal) / 10000,
        totalPayment: totalPayment / 10000,
        schedule,
      });
    } else if (values.repaymentType === 'equalprincipal') {
      // 等额本金
      const monthlyPrincipal = principal / months;
      for (let i = 1; i <= months; i++) {
        const interest = remaining * monthlyRate;
        const payment = monthlyPrincipal + interest;
        remaining -= monthlyPrincipal;
        totalPayment += payment;
        schedule.push({
          key: i,
          month: i,
          payment,
          principal: monthlyPrincipal,
          interest,
          remaining: Math.max(remaining, 0),
        });
      }
      setLoanResult({
        monthlyPayment: (monthlyPrincipal + principal * monthlyRate) / 10000,
        totalInterest: (totalPayment - principal) / 10000,
        totalPayment: totalPayment / 10000,
        schedule,
      });
    } else {
      // 先息后本：每月只还利息，最后一期还全部本金+利息
      const monthlyInterest = principal * monthlyRate;
      for (let i = 1; i <= months; i++) {
        const isLast = i === months;
        const prinPart = isLast ? principal : 0;
        const payment = monthlyInterest + prinPart;
        if (isLast) remaining = 0;
        totalPayment += payment;
        schedule.push({
          key: i,
          month: i,
          payment,
          principal: prinPart,
          interest: monthlyInterest,
          remaining: isLast ? 0 : remaining,
        });
      }
      setLoanResult({
        monthlyPayment: monthlyInterest / 10000,
        totalInterest: (monthlyInterest * months) / 10000,
        totalPayment: totalPayment / 10000,
        schedule,
      });
    }
    setShowSchedule(false);
  };

  const scheduleColumns = [
    {
      title: '期数',
      dataIndex: 'month',
      key: 'month',
      width: 70,
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: '#1A1A2E' }}>第{v}期</span>
      ),
    },
    {
      title: '月供(元)',
      dataIndex: 'payment',
      key: 'payment',
      width: 130,
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: '#C9A962' }}>¥ {money(v)}</span>
      ),
    },
    {
      title: '本金(元)',
      dataIndex: 'principal',
      key: 'principal',
      width: 130,
      render: (v: number) => (
        <span style={{ color: '#1A1A2E' }}>¥ {money(v)}</span>
      ),
    },
    {
      title: '利息(元)',
      dataIndex: 'interest',
      key: 'interest',
      width: 130,
      render: (v: number) => (
        <span style={{ color: '#FFAB00' }}>¥ {money(v)}</span>
      ),
    },
    {
      title: '剩余本金(元)',
      dataIndex: 'remaining',
      key: 'remaining',
      width: 150,
      render: (v: number) => (
        <span style={{ color: '#6B7280' }}>¥ {money(v)}</span>
      ),
    },
  ];

  const cardStyle = {
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 20,
    padding: 36,
    boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
  };

  const resultCardStyle = {
    background: 'linear-gradient(135deg, #0A0E1A 0%, #111827 100%)',
    borderRadius: 16,
    padding: 32,
    textAlign: 'center' as const,
    marginTop: 24,
    border: '1px solid rgba(201,169,98,0.2)',
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <Title
          level={3}
          style={{ color: '#1A1A2E', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}
        >
          贷款计算器
        </Title>
        <Text style={{ color: '#6B7280', fontSize: 14 }}>
          快速评估融资额度，精确计算月供明细
        </Text>
      </div>

      {/* Mode switcher */}
      <div style={{ marginBottom: 28 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as 'estimate' | 'loan')}
          options={[
            { label: '融资评估', value: 'estimate' },
            { label: '月供计算', value: 'loan' },
          ]}
          style={{
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 12,
            padding: 3,
          }}
        />
      </div>

      <div style={{ maxWidth: 960 }}>
        {mode === 'estimate' ? (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(201,169,98,0.15), rgba(201,169,98,0.05))',
                border: '1px solid rgba(201,169,98,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CalculatorOutlined style={{ fontSize: 20, color: '#C9A962' }} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E' }}>融资额度评估</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>输入企业信息，快速测算可贷款额度</div>
              </div>
            </div>

            <Form form={estimateForm} layout="vertical" onFinish={onEstimate}>
              <Row gutter={24}>
                <Col xs={24} md={12}>
                  <Form.Item name="revenue" label="年营业额" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="请选择年营业额" size="large" style={{ borderRadius: 12 }}>
                      <Select.Option value="100-300">100-300万</Select.Option>
                      <Select.Option value="300-500">300-500万</Select.Option>
                      <Select.Option value="500-1000">500-1000万</Select.Option>
                      <Select.Option value="1000+">1000万以上</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="taxLevel" label="纳税等级" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="请选择纳税等级" size="large">
                      <Select.Option value="A级">A级</Select.Option>
                      <Select.Option value="B级">B级</Select.Option>
                      <Select.Option value="C级">C级</Select.Option>
                      <Select.Option value="未评级">未评级</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="hasInvoice" label="是否开票" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="请选择" size="large">
                      <Select.Option value={true}>是</Select.Option>
                      <Select.Option value={false}>否</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  style={{
                    height: 48, borderRadius: 14, fontWeight: 600, fontSize: 15,
                    background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                    border: 'none', color: '#0A0E1A',
                    boxShadow: '0 4px 16px rgba(201,169,98,0.3)',
                    width: 200,
                  }}
                >
                  立即评估
                </Button>
              </Form.Item>
            </Form>

            {estimateResult && (
              <div style={resultCardStyle}>
                <div style={{ fontSize: 12, color: '#8B8FA3', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                  预估贷款额度
                </div>
                <div style={{
                  fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em',
                  background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  {estimateResult.min} - {estimateResult.max} 万
                </div>
                <div style={{ fontSize: 13, color: '#555B6E', marginTop: 8 }}>
                  具体额度以审批结果为准
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(201,169,98,0.15), rgba(201,169,98,0.05))',
                  border: '1px solid rgba(201,169,98,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CalculatorOutlined style={{ fontSize: 20, color: '#C9A962' }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E' }}>月供计算</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>输入贷款信息，精确测算月供和还款明细</div>
                </div>
              </div>

              <Form form={loanForm} layout="vertical" onFinish={onLoan}>
                <Row gutter={24}>
                  <Col xs={24} md={12}>
                    <Form.Item name="amount" label="贷款金额（万元）" rules={[{ required: true, message: '请输入' }]}>
                      <Input type="number" placeholder="请输入贷款金额" size="large" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="term" label="贷款期限" rules={[{ required: true, message: '请选择' }]}>
                      <Select placeholder="请选择期限" size="large">
                        <Select.Option value={12}>12个月（1年）</Select.Option>
                        <Select.Option value={24}>24个月（2年）</Select.Option>
                        <Select.Option value={36}>36个月（3年）</Select.Option>
                        <Select.Option value={48}>48个月（4年）</Select.Option>
                        <Select.Option value={60}>60个月（5年）</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="rate" label="年利率（%）" rules={[{ required: true, message: '请输入' }]} initialValue={4.35}>
                      <Input type="number" step="0.1" placeholder="年利率" size="large" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="repaymentType" label="还款方式" rules={[{ required: true, message: '请选择' }]}>
                      <Select placeholder="请选择" size="large">
                        <Select.Option value="equalinstallment">等额本息</Select.Option>
                        <Select.Option value="equalprincipal">等额本金</Select.Option>
                        <Select.Option value="interestfirst">先息后本</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    style={{
                      height: 48, borderRadius: 14, fontWeight: 600, fontSize: 15,
                      background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                      border: 'none', color: '#0A0E1A',
                      boxShadow: '0 4px 16px rgba(201,169,98,0.3)',
                      width: 200,
                    }}
                  >
                    计算月供
                  </Button>
                </Form.Item>
              </Form>

              {loanResult && (
                <div style={resultCardStyle}>
                  <div style={{ fontSize: 12, color: '#8B8FA3', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                    每月还款金额（首期）
                  </div>
                  <div style={{
                    fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em',
                    background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>
                    ¥ {money(loanResult.monthlyPayment)} 万
                  </div>

                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
                    marginTop: 24, textAlign: 'center',
                  }}>
                    <div style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 20,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: 12, color: '#8B8FA3', marginBottom: 6 }}>贷款总额</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#F0F0F5' }}>
                        ¥ {money(loanResult.totalPayment - loanResult.totalInterest)} 万
                      </div>
                    </div>
                    <div style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 20,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: 12, color: '#8B8FA3', marginBottom: 6 }}>总利息</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#FFAB00' }}>
                        ¥ {money(loanResult.totalInterest)} 万
                      </div>
                    </div>
                    <div style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 20,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: 12, color: '#8B8FA3', marginBottom: 6 }}>总还款</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#F0F0F5' }}>
                        ¥ {money(loanResult.totalPayment)} 万
                      </div>
                    </div>
                  </div>

                  {/* Toggle schedule button */}
                  <div
                    onClick={() => setShowSchedule(!showSchedule)}
                    style={{
                      marginTop: 20,
                      cursor: 'pointer',
                      color: '#C9A962',
                      fontSize: 14,
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    {showSchedule ? '收起还款明细' : '查看逐月还款明细'}
                    {showSchedule ? <UpOutlined style={{ fontSize: 12 }} /> : <DownOutlined style={{ fontSize: 12 }} />}
                  </div>
                </div>
              )}
            </div>

            {/* Monthly schedule table */}
            {loanResult && showSchedule && (
              <div style={{
                ...cardStyle,
                marginTop: 24,
                padding: 0,
                overflow: 'hidden',
              }}>
                {/* Schedule header */}
                <div style={{
                  padding: '24px 36px 16px',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E' }}>
                      逐月还款明细
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                      共 {loanResult.schedule.length} 期 · 单位：人民币（元）
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', gap: 16, fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: '#C9A962' }} />
                      <span style={{ color: '#6B7280' }}>月供</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1A1A2E' }} />
                      <span style={{ color: '#6B7280' }}>本金</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: '#FFAB00' }} />
                      <span style={{ color: '#6B7280' }}>利息</span>
                    </div>
                  </div>
                </div>

                {/* Summary bar */}
                <div style={{
                  padding: '16px 36px',
                  background: 'rgba(201,169,98,0.04)',
                  display: 'flex',
                  gap: 32,
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>首期月供</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#C9A962' }}>
                      ¥ {money(loanResult.schedule[0].payment)}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>末期月供</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#C9A962' }}>
                      ¥ {money(loanResult.schedule[loanResult.schedule.length - 1].payment)}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>利息占比</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#FFAB00' }}>
                      {((loanResult.totalInterest / loanResult.totalPayment) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>月供变化</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                      {loanResult.schedule[0].principal === 0
                        ? '末期还本'
                        : loanResult.schedule[0].payment === loanResult.schedule[loanResult.schedule.length - 1].payment
                          ? '固定不变'
                          : '逐月递减'}
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div style={{ padding: '0 12px 12px' }}>
                  <Table
                    dataSource={loanResult.schedule}
                    columns={scheduleColumns}
                    pagination={{
                      pageSize: 12,
                      size: 'small',
                      showTotal: (total, range) => `第 ${range[0]}-${range[1]} 期 / 共 ${total} 期`,
                    }}
                    size="middle"
                    scroll={{ x: 600 }}
                    summary={(pageData) => {
                      const totalPayment = pageData.reduce((sum, r) => sum + r.payment, 0);
                      const totalPrincipal = pageData.reduce((sum, r) => sum + r.principal, 0);
                      const totalInterest = pageData.reduce((sum, r) => sum + r.interest, 0);
                      return (
                        <Table.Summary fixed>
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0}>
                              <span style={{ fontWeight: 700, color: '#1A1A2E' }}>本页合计</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1}>
                              <span style={{ fontWeight: 700, color: '#C9A962' }}>¥ {money(totalPayment)}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2}>
                              <span style={{ fontWeight: 600, color: '#1A1A2E' }}>¥ {money(totalPrincipal)}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3}>
                              <span style={{ fontWeight: 600, color: '#FFAB00' }}>¥ {money(totalInterest)}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4}>
                              <span style={{ color: '#6B7280' }}>—</span>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      );
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
