import { useState } from 'react';
import { Button, Row, Col, Form, Input, Select, Segmented } from 'antd';
import {
  ArrowRightOutlined,
  FileSearchOutlined,
  BankOutlined,
  CalculatorOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  StarFilled,
  PhoneOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';

interface LandingPageProps {
  onOpenLogin: () => void;
}

/* ─── helpers ─── */
function money(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LandingPage({ onOpenLogin }: LandingPageProps) {
  const [calcMode, setCalcMode] = useState<'estimate' | 'loan'>('estimate');
  const [estimateForm] = Form.useForm();
  const [loanForm] = Form.useForm();
  const [estimateResult, setEstimateResult] = useState<{ min: number; max: number } | null>(null);
  const [loanResult, setLoanResult] = useState<{
    monthlyPayment: number;
    totalInterest: number;
    totalPayment: number;
  } | null>(null);

  const onEstimate = (values: { revenue: string; taxLevel: string; hasInvoice: boolean }) => {
    const ranges: Record<string, [number, number]> = {
      '100-300': [50, 100], '300-500': [100, 200], '500-1000': [200, 500], '1000+': [500, 1000],
    };
    const coeffs: Record<string, number> = { 'A级': 1.5, 'B级': 1.2, 'C级': 0.8, '未评级': 0.5 };
    const [min, max] = ranges[values.revenue] || [50, 100];
    const c = coeffs[values.taxLevel] || 0.8;
    const b = values.hasInvoice ? 1.2 : 1.0;
    setEstimateResult({ min: Math.round(min * c * b), max: Math.round(max * c * b) });
  };

  const onLoan = (values: { amount: number; term: number; rate: number; repaymentType: string }) => {
    const p = values.amount * 10000;
    const mr = values.rate / 100 / 12;
    const m = values.term;
    let mp: number, tp: number;
    if (values.repaymentType === 'equalinstallment') {
      mp = p * (mr * Math.pow(1 + mr, m)) / (Math.pow(1 + mr, m) - 1);
      tp = mp * m;
    } else if (values.repaymentType === 'equalprincipal') {
      mp = p / m + p * mr;
      let t = 0;
      for (let i = 0; i < m; i++) t += p / m + p * mr * (1 - i / m);
      tp = t;
    } else {
      mp = p * mr;
      tp = p * mr * m + p;
    }
    setLoanResult({ monthlyPayment: mp / 10000, totalInterest: (tp - p) / 10000, totalPayment: tp / 10000 });
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  /* ─── Styles ─── */
  const sectionPadding = { padding: '120px 0' };
  const container = { maxWidth: 1280, margin: '0 auto', padding: '0 24px' };
  const goldGradient = 'linear-gradient(135deg, #C9A962, #E8D5A3)';
  const darkCard = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 40,
    transition: 'all 0.4s cubic-bezier(0.25,0.8,0.25,1)',
  };

  return (
    <div style={{ background: '#0A0A0A', color: '#fff', minHeight: '100vh', overflow: 'hidden' }}>

      {/* ═══════════ NAV ═══════════ */}
      <nav
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          padding: '0 48px', height: 72,
          background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 22, fontWeight: 700, letterSpacing: 3,
              background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}
          >
            云上融
          </span>
          <span style={{ fontSize: 11, color: '#555B6E', letterSpacing: '0.05em', marginTop: 2 }}>
            YunShangRong
          </span>
        </div>
        <div style={{ display: 'flex', gap: 36, alignItems: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {[
            { label: '核心优势', id: 'features' },
            { label: '产品服务', id: 'products' },
            { label: '客户案例', id: 'cases' },
            { label: '贷款计算', id: 'calculator' },
            { label: '联系我们', id: 'contact' },
          ].map((item) => (
            <a
              key={item.id}
              onClick={() => scrollTo(item.id)}
              style={{
                color: '#8B8FA3', fontSize: 14, cursor: 'pointer', textDecoration: 'none',
                transition: 'color 0.2s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#F0F0F5')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8B8FA3')}
            >
              {item.label}
            </a>
          ))}
        </div>
        <Button
          onClick={onOpenLogin}
          style={{
            background: goldGradient, border: 'none', color: '#0A0E1A',
            borderRadius: 20, fontWeight: 600, height: 38, padding: '0 24px',
            boxShadow: '0 2px 12px rgba(201,169,98,0.3)', flexShrink: 0,
          }}
        >
          登录 / 注册
        </Button>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 72, position: 'relative' }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 900, height: 900,
          background: 'radial-gradient(circle, rgba(201,169,98,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={container}>
          <Row gutter={[40, 60]} align="middle" justify="center">
            <Col xs={24} lg={10}>
              <div style={{ maxWidth: 520 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 18px', background: 'rgba(201,169,98,0.08)',
                  borderRadius: 20, border: '1px solid rgba(201,169,98,0.15)',
                  marginBottom: 32, fontSize: 13, color: '#C9A962',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#36B37E' }} />
                  已服务 500+ 中小企业
                </div>
                <h1 style={{
                  fontSize: 'clamp(2.8rem, 6vw, 4.2rem)', fontWeight: 700, letterSpacing: '-0.03em',
                  lineHeight: 1.15, marginBottom: 24,
                  background: 'linear-gradient(135deg, #ffffff 0%, #a0a0a0 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  为您护航<br />由此开启
                </h1>
                <p style={{ fontSize: 18, color: '#8B8FA3', marginBottom: 40, lineHeight: 1.8, maxWidth: 440 }}>
                  专注中小企业融资服务，专业团队为您定制最优金融方案。AI 驱动征信分析，让融资决策更智能。
                </p>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <Button
                    size="large"
                    onClick={() => scrollTo('calculator')}
                    style={{
                      background: goldGradient, border: 'none', color: '#0A0E1A',
                      borderRadius: 14, fontWeight: 600, height: 52, padding: '0 32px',
                      boxShadow: '0 4px 20px rgba(201,169,98,0.3)', fontSize: 15,
                    }}
                  >
                    免费评估额度 <ArrowRightOutlined />
                  </Button>
                  <Button
                    size="large"
                    ghost
                    onClick={onOpenLogin}
                    style={{
                      borderRadius: 14, fontWeight: 600, height: 52, padding: '0 32px',
                      borderColor: 'rgba(201,169,98,0.3)', color: '#C9A962', fontSize: 15,
                    }}
                  >
                    立即注册
                  </Button>
                </div>
              </div>
            </Col>

            {/* ── 分隔装饰 ── */}
            <Col xs={0} lg={4} style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, height: 320 }}>
                <div style={{
                  width: 1, flex: 1,
                  background: 'linear-gradient(to bottom, transparent, rgba(201,169,98,0.4), transparent)',
                }} />
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(201,169,98,0.08)', border: '1px solid rgba(201,169,98,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 18, fontWeight: 700,
                    background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>YS</span>
                </div>
                <div style={{
                  width: 1, flex: 1,
                  background: 'linear-gradient(to bottom, transparent, rgba(201,169,98,0.4), transparent)',
                }} />
              </div>
            </Col>

            <Col xs={24} lg={10} style={{ display: 'flex', justifyContent: 'center' }}>
              {/* Credit card visual */}
              <div style={{
                width: 400, height: 250, borderRadius: 24,
                background: goldGradient,
                boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 0 80px rgba(201,169,98,0.15)',
                padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                animation: 'heroFloat 8s ease-in-out infinite',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    width: 50, height: 38, borderRadius: 8,
                    background: 'linear-gradient(135deg, #d4af37, #f5d78e, #c9a962)',
                    border: '1px solid rgba(0,0,0,0.1)',
                  }} />
                  <span style={{ fontSize: 20, fontWeight: 700, fontStyle: 'italic', color: '#1a1a1a' }}>云上融</span>
                </div>
                <div style={{
                  fontFamily: 'SF Mono, Courier New, monospace',
                  fontSize: 20, fontWeight: 700, letterSpacing: 4, color: '#1a1a1a',
                }}>
                  6228 **** **** 8888
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>持卡人</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>YOUR NAME</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>有效期</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>12/28</div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
        <style>{`
          @keyframes heroFloat {
            0%, 100% { transform: perspective(1000px) rotateY(-10deg) rotateX(5deg) translateY(0); }
            50% { transform: perspective(1000px) rotateY(6deg) rotateX(-3deg) translateY(-20px); }
          }
        `}</style>
      </section>

      {/* ═══════════ STATS ═══════════ */}
      <section style={{
        padding: '80px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0f0f0f',
      }}>
        <div style={container}>
          <Row gutter={[40, 40]}>
            {[
              { value: '500+', label: '服务企业' },
              { value: '10亿+', label: '融资总额' },
              { value: '98%', label: '服务满意度' },
              { value: '3天', label: '最快放款' },
            ].map((stat, i) => (
              <Col xs={12} md={6} key={i}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', fontWeight: 700,
                    background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    marginBottom: 8,
                  }}>
                    {stat.value}
                  </div>
                  <div style={{ color: '#8B8FA3', fontSize: 14 }}>{stat.label}</div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" style={sectionPadding}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 80px' }}>
            <h2 style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, marginBottom: 16,
              letterSpacing: '-0.03em',
            }}>
              为什么选择云上融？
            </h2>
            <p style={{ color: '#8B8FA3', fontSize: 17 }}>
              专业融资团队 + AI 智能分析，为您提供一站式金融解决方案
            </p>
          </div>
          <Row gutter={[32, 32]}>
            {[
              { icon: <SafetyOutlined />, title: '安全可靠', desc: '银行级数据加密，客户信息严格保密，100%数据隔离存储' },
              { icon: <ThunderboltOutlined />, title: '极速审批', desc: '最快3个工作日放款，AI 加速审核流程，解决资金燃眉之急' },
              { icon: <TeamOutlined />, title: '1对1服务', desc: '专业融资顾问全程跟进，量身定制最优融资方案，贴心可靠' },
            ].map((f, i) => (
              <Col xs={24} md={8} key={i}>
                <div
                  style={darkCard}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(201,169,98,0.2)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3), 0 0 20px rgba(201,169,98,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: 60, height: 60, borderRadius: 18,
                    background: 'linear-gradient(135deg, rgba(201,169,98,0.15), rgba(201,169,98,0.05))',
                    border: '1px solid rgba(201,169,98,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 26, color: '#C9A962', marginBottom: 24,
                  }}>
                    {f.icon}
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, color: '#F0F0F5' }}>{f.title}</h3>
                  <p style={{ color: '#8B8FA3', fontSize: 15, lineHeight: 1.8 }}>{f.desc}</p>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ═══════════ PRODUCTS ═══════════ */}
      <section id="products" style={{ ...sectionPadding, background: '#0f0f0f' }}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 80px' }}>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, marginBottom: 16, letterSpacing: '-0.03em' }}>
              产品服务
            </h2>
            <p style={{ color: '#8B8FA3', fontSize: 17 }}>
              三大核心工具，覆盖融资分析全流程
            </p>
          </div>
          <Row gutter={[32, 32]}>
            {[
              {
                icon: <FileSearchOutlined />,
                title: '征信报告分析',
                desc: '上传征信报告 PDF，AI 自动提取负债、逾期、查询记录等 12+ 维度关键数据，生成可视化分析报告。',
                features: ['自动 OCR 识别', '负债结构分析', '逾期风险预警', '查询频率监控'],
                mockImg: (
                  <div style={{
                    background: 'linear-gradient(135deg, #111827, #1A2035)',
                    borderRadius: 12, padding: 20, marginBottom: 24,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                      <div style={{ flex: 1, background: 'rgba(201,169,98,0.1)', borderRadius: 8, padding: '12px 16px' }}>
                        <div style={{ fontSize: 10, color: '#8B8FA3', marginBottom: 4 }}>总负债</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#C9A962' }}>42.8万</div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(54,179,126,0.1)', borderRadius: 8, padding: '12px 16px' }}>
                        <div style={{ fontSize: 10, color: '#8B8FA3', marginBottom: 4 }}>信用卡额度</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#36B37E' }}>18.5万</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: '62%', height: '100%', background: goldGradient, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#555B6E', marginTop: 6, textAlign: 'right' }}>用卡率 62%</div>
                  </div>
                ),
              },
              {
                icon: <BankOutlined />,
                title: '银行流水分析',
                desc: '上传银行流水 Excel/PDF，智能汇总月度收支、识别异常交易、分析收入来源，一键生成分析报告。',
                features: ['收支趋势图表', '异常交易检测', '收入来源分析', '去重后净收入'],
                mockImg: (
                  <div style={{
                    background: 'linear-gradient(135deg, #111827, #1A2035)',
                    borderRadius: 12, padding: 20, marginBottom: 24,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginBottom: 12 }}>
                      {[65, 45, 78, 52, 88, 40, 72, 55, 90, 48, 82, 60].map((h, i) => (
                        <div key={i} style={{
                          flex: 1, height: `${h}%`, borderRadius: '3px 3px 0 0',
                          background: i % 2 === 0
                            ? 'linear-gradient(to top, rgba(54,179,126,0.2), rgba(54,179,126,0.6))'
                            : 'linear-gradient(to top, rgba(255,86,48,0.2), rgba(255,86,48,0.5))',
                        }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555B6E' }}>
                      <span>1月</span><span>6月</span><span>12月</span>
                    </div>
                  </div>
                ),
              },
              {
                icon: <CalculatorOutlined />,
                title: '贷款计算器',
                desc: '支持等额本息、等额本金、先息后本三种方式，精确计算月供明细，逐月还款账单一目了然。',
                features: ['三种还款方式', '逐月还款明细', '融资额度评估', '利息占比分析'],
                mockImg: (
                  <div style={{
                    background: 'linear-gradient(135deg, #111827, #1A2035)',
                    borderRadius: 12, padding: 20, marginBottom: 24,
                    border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, color: '#8B8FA3', marginBottom: 6 }}>每月还款</div>
                    <div style={{
                      fontSize: 28, fontWeight: 700,
                      background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                      ¥ 8,256.80
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 14px' }}>
                        <div style={{ fontSize: 9, color: '#555B6E' }}>总利息</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#FFAB00' }}>5.2万</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 14px' }}>
                        <div style={{ fontSize: 9, color: '#555B6E' }}>总还款</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F5' }}>45.2万</div>
                      </div>
                    </div>
                  </div>
                ),
              },
            ].map((product, i) => (
              <Col xs={24} md={8} key={i}>
                <div
                  style={{
                    ...darkCard,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(201,169,98,0.2)';
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16,
                    background: 'linear-gradient(135deg, rgba(201,169,98,0.15), rgba(201,169,98,0.05))',
                    border: '1px solid rgba(201,169,98,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, color: '#C9A962', marginBottom: 20,
                  }}>
                    {product.icon}
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, color: '#F0F0F5', marginBottom: 12 }}>{product.title}</h3>
                  <p style={{ color: '#8B8FA3', fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>{product.desc}</p>

                  {/* Mock screenshot */}
                  {product.mockImg}

                  {/* Feature list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, flex: 1 }}>
                    {product.features.map((f, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8B8FA3' }}>
                        <CheckCircleOutlined style={{ color: '#C9A962', fontSize: 14 }} />
                        {f}
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={onOpenLogin}
                    block
                    style={{
                      background: 'rgba(201,169,98,0.1)', border: '1px solid rgba(201,169,98,0.2)',
                      color: '#C9A962', borderRadius: 12, height: 44, fontWeight: 600,
                    }}
                  >
                    立即体验 <ArrowRightOutlined />
                  </Button>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ═══════════ CASES ═══════════ */}
      <section id="cases" style={sectionPadding}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 80px' }}>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, marginBottom: 16, letterSpacing: '-0.03em' }}>
              客户案例
            </h2>
            <p style={{ color: '#8B8FA3', fontSize: 17 }}>
              真实反馈，值得信赖
            </p>
          </div>
          <Row gutter={[32, 32]}>
            {[
              {
                name: '张总', company: '某科技有限公司',
                quote: '通过云上融平台，我们仅用2天就完成了征信分析和流水整理，顺利获得了300万的银行授信额度。效率非常高！',
                amount: '300万', days: '2天',
              },
              {
                name: '李总', company: '某贸易有限公司',
                quote: '以前每次融资都要花大量时间整理材料，现在上传PDF就能自动分析，融资顾问也非常专业，推荐给了很多朋友。',
                amount: '500万', days: '3天',
              },
              {
                name: '王总', company: '某制造有限公司',
                quote: '贷款计算器特别实用，等额本金和先息后本的月供对比一目了然，帮我选到了最适合的还款方式，节省了不少利息。',
                amount: '200万', days: '1天',
              },
            ].map((c, i) => (
              <Col xs={24} md={8} key={i}>
                <div style={{
                  ...darkCard,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {/* Stars */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <StarFilled key={s} style={{ color: '#C9A962', fontSize: 16 }} />
                    ))}
                  </div>
                  {/* Quote */}
                  <p style={{ color: '#8B8FA3', fontSize: 14, lineHeight: 1.8, flex: 1, marginBottom: 24 }}>
                    "{c.quote}"
                  </p>
                  {/* Divider */}
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 20 }} />
                  {/* User info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(201,169,98,0.2), rgba(201,169,98,0.1))',
                        border: '1px solid rgba(201,169,98,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#C9A962', fontWeight: 700, fontSize: 14,
                      }}>
                        {c.name[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#F0F0F5', fontSize: 14 }}>{c.name}</div>
                        <div style={{ color: '#555B6E', fontSize: 12 }}>{c.company}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: 18, fontWeight: 700,
                        background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      }}>
                        {c.amount}
                      </div>
                      <div style={{ fontSize: 11, color: '#555B6E' }}>{c.days}获批</div>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ═══════════ CALCULATOR ═══════════ */}
      <section id="calculator" style={{ ...sectionPadding, background: '#0f0f0f' }}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 60px' }}>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, marginBottom: 16, letterSpacing: '-0.03em' }}>
              贷款计算器
            </h2>
            <p style={{ color: '#8B8FA3', fontSize: 17 }}>
              免费在线计算，无需注册即可使用
            </p>
          </div>

          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <Segmented
                value={calcMode}
                onChange={(v) => setCalcMode(v as 'estimate' | 'loan')}
                options={[
                  { label: '融资评估', value: 'estimate' },
                  { label: '月供计算', value: 'loan' },
                ]}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 12, padding: 3,
                }}
              />
            </div>

            <div style={darkCard}>
              {calcMode === 'estimate' ? (
                <>
                  <Form form={estimateForm} layout="vertical" onFinish={onEstimate}>
                    <Row gutter={24}>
                      <Col xs={24} md={12}>
                        <Form.Item name="revenue" label={<span style={{ color: '#8B8FA3' }}>年营业额</span>} rules={[{ required: true, message: '请选择' }]}>
                          <Select placeholder="请选择" size="large">
                            <Select.Option value="100-300">100-300万</Select.Option>
                            <Select.Option value="300-500">300-500万</Select.Option>
                            <Select.Option value="500-1000">500-1000万</Select.Option>
                            <Select.Option value="1000+">1000万以上</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="taxLevel" label={<span style={{ color: '#8B8FA3' }}>纳税等级</span>} rules={[{ required: true, message: '请选择' }]}>
                          <Select placeholder="请选择" size="large">
                            <Select.Option value="A级">A级</Select.Option>
                            <Select.Option value="B级">B级</Select.Option>
                            <Select.Option value="C级">C级</Select.Option>
                            <Select.Option value="未评级">未评级</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="hasInvoice" label={<span style={{ color: '#8B8FA3' }}>是否开票</span>} rules={[{ required: true, message: '请选择' }]}>
                          <Select placeholder="请选择" size="large">
                            <Select.Option value={true}>是</Select.Option>
                            <Select.Option value={false}>否</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" size="large" style={{
                      background: goldGradient, border: 'none', color: '#0A0E1A',
                      borderRadius: 14, fontWeight: 600, height: 48, width: 200,
                      boxShadow: '0 4px 16px rgba(201,169,98,0.3)',
                    }}>
                      立即评估
                    </Button>
                  </Form>
                  {estimateResult && (
                    <div style={{ textAlign: 'center', marginTop: 32, padding: 32, background: 'rgba(201,169,98,0.04)', borderRadius: 16, border: '1px solid rgba(201,169,98,0.15)' }}>
                      <div style={{ fontSize: 12, color: '#8B8FA3', letterSpacing: '0.1em', marginBottom: 12 }}>预估贷款额度</div>
                      <div style={{
                        fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em',
                        background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      }}>
                        {estimateResult.min} - {estimateResult.max} 万
                      </div>
                      <div style={{ color: '#555B6E', marginTop: 12, fontSize: 13 }}>
                        具体额度以审批结果为准 ·
                        <a onClick={onOpenLogin} style={{ color: '#C9A962', marginLeft: 8, cursor: 'pointer' }}>
                          登录获取详细方案 →
                        </a>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Form form={loanForm} layout="vertical" onFinish={onLoan}>
                    <Row gutter={24}>
                      <Col xs={24} md={12}>
                        <Form.Item name="amount" label={<span style={{ color: '#8B8FA3' }}>贷款金额（万元）</span>} rules={[{ required: true, message: '请输入' }]}>
                          <Input type="number" placeholder="请输入" size="large" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="term" label={<span style={{ color: '#8B8FA3' }}>贷款期限</span>} rules={[{ required: true, message: '请选择' }]}>
                          <Select placeholder="请选择" size="large">
                            <Select.Option value={12}>12个月</Select.Option>
                            <Select.Option value={24}>24个月</Select.Option>
                            <Select.Option value={36}>36个月</Select.Option>
                            <Select.Option value={60}>60个月</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="rate" label={<span style={{ color: '#8B8FA3' }}>年利率（%）</span>} rules={[{ required: true, message: '请输入' }]} initialValue={4.35}>
                          <Input type="number" step="0.1" size="large" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="repaymentType" label={<span style={{ color: '#8B8FA3' }}>还款方式</span>} rules={[{ required: true, message: '请选择' }]}>
                          <Select placeholder="请选择" size="large">
                            <Select.Option value="equalinstallment">等额本息</Select.Option>
                            <Select.Option value="equalprincipal">等额本金</Select.Option>
                            <Select.Option value="interestfirst">先息后本</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" size="large" style={{
                      background: goldGradient, border: 'none', color: '#0A0E1A',
                      borderRadius: 14, fontWeight: 600, height: 48, width: 200,
                      boxShadow: '0 4px 16px rgba(201,169,98,0.3)',
                    }}>
                      计算月供
                    </Button>
                  </Form>
                  {loanResult && (
                    <div style={{ textAlign: 'center', marginTop: 32, padding: 32, background: 'rgba(201,169,98,0.04)', borderRadius: 16, border: '1px solid rgba(201,169,98,0.15)' }}>
                      <div style={{ fontSize: 12, color: '#8B8FA3', letterSpacing: '0.1em', marginBottom: 12 }}>每月还款（首期）</div>
                      <div style={{
                        fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em',
                        background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      }}>
                        ¥ {money(loanResult.monthlyPayment)} 万
                      </div>
                      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 20 }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 24px' }}>
                          <div style={{ fontSize: 11, color: '#555B6E' }}>总利息</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#FFAB00' }}>¥ {money(loanResult.totalInterest)} 万</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 24px' }}>
                          <div style={{ fontSize: 11, color: '#555B6E' }}>总还款</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#F0F0F5' }}>¥ {money(loanResult.totalPayment)} 万</div>
                        </div>
                      </div>
                      <div style={{ color: '#555B6E', marginTop: 16, fontSize: 13 }}>
                        <a onClick={onOpenLogin} style={{ color: '#C9A962', cursor: 'pointer' }}>
                          登录查看逐月还款明细 →
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section style={{ padding: '100px 0', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(201,169,98,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ ...container, textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, marginBottom: 16, letterSpacing: '-0.03em' }}>
            开始免费使用
          </h2>
          <p style={{ color: '#8B8FA3', fontSize: 17, marginBottom: 40, maxWidth: 480, margin: '0 auto 40px' }}>
            注册即可使用征信分析、流水分析、贷款计算器等全部功能
          </p>
          <Button
            size="large"
            onClick={onOpenLogin}
            style={{
              background: goldGradient, border: 'none', color: '#0A0E1A',
              borderRadius: 14, fontWeight: 600, height: 56, padding: '0 48px',
              boxShadow: '0 4px 30px rgba(201,169,98,0.4)', fontSize: 17,
            }}
          >
            免费注册 <ArrowRightOutlined />
          </Button>
        </div>
      </section>

      {/* ═══════════ CONTACT ═══════════ */}
      <section id="contact" style={{ ...sectionPadding, background: '#0f0f0f' }}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 60px' }}>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, marginBottom: 16, letterSpacing: '-0.03em' }}>
              联系我们
            </h2>
            <p style={{ color: '#8B8FA3', fontSize: 17 }}>
              专业顾问随时为您服务
            </p>
          </div>
          <Row gutter={[32, 32]} justify="center">
            {[
              { icon: <PhoneOutlined />, label: '咨询电话', value: '18312888428' },
              { icon: <EnvironmentOutlined />, label: '公司地址', value: '茂名市茂南区恒福尚城写字楼1号楼301室' },
            ].map((c, i) => (
              <Col xs={24} md={8} key={i}>
                <div style={{ ...darkCard, textAlign: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: 'linear-gradient(135deg, rgba(201,169,98,0.15), rgba(201,169,98,0.05))',
                    border: '1px solid rgba(201,169,98,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, color: '#C9A962', margin: '0 auto 16px',
                  }}>
                    {c.icon}
                  </div>
                  <div style={{ color: '#8B8FA3', fontSize: 13, marginBottom: 8 }}>{c.label}</div>
                  <div style={{ color: '#F0F0F5', fontSize: 18, fontWeight: 600 }}>{c.value}</div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer style={{
        padding: '60px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        textAlign: 'center',
      }}>
        <div style={container}>
          <div style={{
            fontSize: 20, fontWeight: 700, letterSpacing: 3, marginBottom: 20,
            background: goldGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            云上融
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 36, marginBottom: 24 }}>
            {['核心优势', '产品服务', '客户案例', '贷款计算', '联系我们'].map((label, i) => (
              <a
                key={i}
                onClick={() => scrollTo(['features', 'products', 'cases', 'calculator', 'contact'][i])}
                style={{ color: '#555B6E', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#8B8FA3')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#555B6E')}
              >
                {label}
              </a>
            ))}
          </div>
          <div style={{ color: '#333', fontSize: 12 }}>
            © 2026 云上融科技 · 专注中小企业融资服务 · 科技赋能金融
          </div>
        </div>
      </footer>
    </div>
  );
}
