import { useRef } from 'react'
import { Button, Tag } from 'antd'
import { PrinterOutlined, SwapOutlined, CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import type { ReportData, DimKey } from '../../types/diagnosis'

interface Props {
  data: ReportData
  clientName: string
  companyName: string
  onBack: () => void
  onToggleView: () => void
}

const DIM_LABELS: Record<DimKey, string> = {
  credit:     '征信健康',
  cashflow:   '经营数据',
  structure:  '融资结构',
  collateral: '抵押资源',
  intent:     '融资意图',
}

const DIM_COLORS: Record<DimKey, string> = {
  credit:     '#185FA5',
  cashflow:   '#1D9E75',
  structure:  '#534AB7',
  collateral: '#BA7517',
  intent:     '#888780',
}

const LEVEL_MAP = {
  high:   { label: '高风险', color: '#E24B4A', bg: 'rgba(226,75,74,0.06)' },
  medium: { label: '中风险', color: '#BA7517', bg: 'rgba(186,117,23,0.06)' },
  low:    { label: '正向项', color: '#1D9E75', bg: 'rgba(29,158,117,0.06)' },
}

export default function DiagnosticReport({ data, clientName, companyName, onBack, onToggleView }: Props) {
  const reportRef = useRef<HTMLDivElement>(null)

  const grade = data.grade || { label: '—', desc: '', color: '#888', level: '?' }

  // ─── 雷达图配置 ────────────────────────────────────────────────────
  const radarOption = {
    tooltip: {},
    radar: {
      indicator: [
        { name: '征信健康', max: 100 },
        { name: '经营数据', max: 100 },
        { name: '融资结构', max: 100 },
        { name: '抵押资源', max: 100 },
        { name: '融资意图', max: 100 },
      ],
      shape: 'circle',
      splitNumber: 4,
      axisName: { color: '#555', fontSize: 12 },
      splitArea: { areaStyle: { color: ['rgba(201,169,98,0.03)', 'rgba(201,169,98,0.06)', 'rgba(201,169,98,0.09)', 'rgba(201,169,98,0.12)'] } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.08)' } },
    },
    series: [{
      type: 'radar',
      data: [{
        value: [
          data.score_credit,
          data.score_cashflow,
          data.score_structure,
          data.score_collateral,
          data.score_intent,
        ],
        name: '评分',
        areaStyle: {
          color: {
            type: 'radial', x: 0.5, y: 0.5, r: 0.5,
            colorStops: [
              { offset: 0, color: 'rgba(201,169,98,0.4)' },
              { offset: 1, color: 'rgba(201,169,98,0.08)' },
            ],
          },
        },
        lineStyle: { color: '#C9A962', width: 2 },
        itemStyle: { color: '#C9A962' },
      }],
    }],
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div ref={reportRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600 }}>

      {/* ─── 顶栏 ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#fff', borderRadius: '12px 12px 0 0',
      }}>
        <div style={{ fontWeight: 500 }}>融资健康报告</div>
        <div style={{ flex: 1, fontSize: 13, color: '#666' }}>
          {clientName} · {companyName}
        </div>
        <Button size="small" icon={<SwapOutlined />} onClick={onToggleView} style={{ borderRadius: 8 }}>
          转屏展示
        </Button>
        <Button size="small" icon={<PrinterOutlined />} onClick={handlePrint} style={{ borderRadius: 8 }}>
          打印
        </Button>
      </div>

      {/* ─── 主体内容 ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#FAFAFA' }}>

        {/* ── 评分概览 ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 20, marginBottom: 20,
        }}>
          {/* 左：总分 + 等级 */}
          <div style={{
            flex: '0 0 200px', background: '#fff', borderRadius: 12,
            padding: '24px 20px', textAlign: 'center',
            border: `1px solid ${grade.color}22`,
          }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>融资健康总分</div>
            <div style={{ fontSize: 72, fontWeight: 600, color: grade.color, lineHeight: 1 }}>
              {data.score_total}
            </div>
            <div style={{
              display: 'inline-block', marginTop: 10, padding: '3px 16px',
              borderRadius: 20, fontSize: 14, fontWeight: 500,
              background: `${grade.color}12`, color: grade.color,
            }}>
              {grade.level} · {grade.label}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{grade.desc}</div>

            {/* 分数构成 */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
                <span>基础分</span><span>{data.base_total}</span>
              </div>
              {data.penalty_total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#E24B4A', marginBottom: 4 }}>
                  <span>惩罚扣分</span><span>-{data.penalty_total}</span>
                </div>
              )}
              {data.bonus_total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1D9E75', marginBottom: 4 }}>
                  <span>加分项</span><span>+{data.bonus_total}</span>
                </div>
              )}
            </div>
          </div>

          {/* 中：雷达图 */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '12px 8px' }}>
            <ReactECharts option={radarOption} style={{ height: 260 }} />
          </div>

          {/* 右：预估额度 */}
          <div style={{
            flex: '0 0 200px', background: '#fff', borderRadius: 12,
            padding: '24px 20px', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>预估可贷额度</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: '#185FA5', lineHeight: 1.2 }}>
              {data.loan_min}–{data.loan_max}
            </div>
            <div style={{ fontSize: 13, color: '#888' }}>万元</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
              {data.loan_range?.note || '基于当前数据估算，实际以银行审批为准'}
            </div>

            <div style={{ flex: 1 }} />

            {data.follow_up_at && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, color: '#888' }}>回访提醒</div>
                <div style={{ fontSize: 12, color: '#BA7517', fontWeight: 500 }}>
                  {data.follow_up_at.split('T')[0]}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 优先行动 ─────────────────────────────────────────────── */}
        {data.top_priorities && data.top_priorities.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1A2E', marginBottom: 10 }}>
              优先行动项
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {data.top_priorities.map((p) => (
                <div key={p.priority} style={{
                  flex: 1, background: '#fff', borderRadius: 12, padding: '14px 16px',
                  borderLeft: '3px solid #E24B4A',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: '50%', background: '#E24B4A', color: '#fff',
                      fontSize: 12, fontWeight: 600,
                    }}>{p.priority}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
                    {p.action}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 五维评分明细 ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1A2E', marginBottom: 10 }}>
            五维评分明细
          </div>
          {(['credit', 'cashflow', 'structure', 'collateral', 'intent'] as DimKey[]).map((key) => {
            const dim = data.dims?.[key]
            if (!dim) return null
            const color = DIM_COLORS[key]
            return (
              <div key={key} style={{
                background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 10,
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color }}>{DIM_LABELS[key]}</div>
                  <div>
                    <span style={{ fontSize: 24, fontWeight: 600, color }}>{dim.normalized}</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>/100</span>
                  </div>
                </div>

                {/* 进度条 */}
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, marginBottom: 12 }}>
                  <div style={{
                    height: '100%', width: `${dim.normalized}%`, background: color,
                    borderRadius: 3, transition: 'width 0.8s ease',
                  }} />
                </div>

                {/* 各题得分 */}
                {dim.breakdown && dim.breakdown.map((b) => (
                  <div key={b.question_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 0', borderBottom: '1px solid #f8f8f8',
                  }}>
                    <span style={{
                      fontSize: 11, color: '#C9A962', background: 'rgba(201,169,98,0.1)',
                      padding: '1px 7px', borderRadius: 10, fontWeight: 500,
                    }}>{b.question_id.toUpperCase()}</span>
                    <span style={{ fontSize: 12, color: '#555', flex: 1 }}>{b.question}</span>
                    <span style={{ fontSize: 12, color: '#888' }}>{b.answer}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color, minWidth: 42, textAlign: 'right' }}>
                      {b.raw_score}/{b.max_score}
                    </span>
                  </div>
                ))}

                {/* 维度风险标签 */}
                {dim.risk_flags && dim.risk_flags.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {dim.risk_flags.map((flag, i) => {
                      const lv = LEVEL_MAP[flag.level as keyof typeof LEVEL_MAP] || LEVEL_MAP.medium
                      return (
                        <div key={i} style={{
                          background: lv.bg, borderRadius: 8, padding: '10px 12px', marginBottom: 6,
                          borderLeft: `3px solid ${lv.color}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Tag color={flag.level === 'high' ? 'error' : flag.level === 'medium' ? 'warning' : 'success'}
                                 style={{ fontSize: 11, margin: 0 }}>
                              {lv.label}
                            </Tag>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{flag.title}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7, marginBottom: 6 }}>
                            {flag.detail}
                          </div>
                          <div style={{ fontSize: 12, color: lv.color, lineHeight: 1.7, fontWeight: 500 }}>
                            建议：{flag.action}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── 惩罚与加分 ──────────────────────────────────────────── */}
        {(data.penalties.length > 0 || data.bonuses.length > 0) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {data.penalties.length > 0 && (
              <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#E24B4A', marginBottom: 10 }}>
                  惩罚项（组合风险）
                </div>
                {data.penalties.map((p, i) => (
                  <div key={i} style={{
                    padding: '8px 0', borderBottom: i < data.penalties.length - 1 ? '1px solid #f5f5f5' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#E24B4A' }}>-{p.penalty}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{p.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {data.bonuses.length > 0 && (
              <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1D9E75', marginBottom: 10 }}>
                  加分项（优势识别）
                </div>
                {data.bonuses.map((b, i) => (
                  <div key={i} style={{
                    padding: '8px 0', borderBottom: i < data.bonuses.length - 1 ? '1px solid #f5f5f5' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{b.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1D9E75' }}>+{b.bonus}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{b.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 数据来源指示 ──────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1A2E', marginBottom: 12 }}>
            评分数据来源
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              {
                label: '问卷评估',
                active: true,
                desc: '基于顾问面对面问诊',
                icon: <CheckCircleOutlined style={{ color: '#1D9E75', fontSize: 18 }} />,
              },
              {
                label: '征信报告',
                active: data.data_sources?.credit ?? false,
                desc: data.data_sources?.credit ? '已融合真实征信数据' : '未上传，使用问卷估算',
                icon: data.data_sources?.credit
                  ? <CheckCircleOutlined style={{ color: '#1D9E75', fontSize: 18 }} />
                  : <InfoCircleOutlined style={{ color: '#bbb', fontSize: 18 }} />,
              },
              {
                label: '银行流水',
                active: data.data_sources?.bank ?? false,
                desc: data.data_sources?.bank ? '已融合真实流水数据' : '未上传，使用问卷估算',
                icon: data.data_sources?.bank
                  ? <CheckCircleOutlined style={{ color: '#1D9E75', fontSize: 18 }} />
                  : <InfoCircleOutlined style={{ color: '#bbb', fontSize: 18 }} />,
              },
            ].map(item => (
              <div key={item.label} style={{
                flex: 1, padding: '12px 14px', borderRadius: 10,
                background: item.active ? 'rgba(29,158,117,0.04)' : '#FAFAFA',
                border: `1px solid ${item.active ? 'rgba(29,158,117,0.2)' : '#f0f0f0'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {item.icon}
                  <span style={{ fontSize: 13, fontWeight: 500, color: item.active ? '#1A1A2E' : '#888' }}>
                    {item.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: item.active ? '#555' : '#aaa', lineHeight: 1.5 }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
          {(!(data.data_sources?.credit) || !(data.data_sources?.bank)) && (
            <div style={{
              marginTop: 10, padding: '8px 12px', background: 'rgba(201,169,98,0.06)',
              borderRadius: 8, fontSize: 12, color: '#BA7517', lineHeight: 1.7,
            }}>
              上传客户的征信报告和银行流水后，系统将自动用真实数据替代问卷估算，评分精度显著提升
            </div>
          )}
        </div>
      </div>

      {/* ─── 底栏 ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderTop: '0.5px solid rgba(0,0,0,0.08)', background: '#fff', borderRadius: '0 0 12px 12px',
      }}>
        <Button onClick={onBack} style={{ borderRadius: 8 }}>新建诊断</Button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#aaa' }}>
          报告生成于 {new Date().toLocaleDateString('zh-CN')}
        </div>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} style={{ borderRadius: 8 }}>
          打印报告
        </Button>
      </div>
    </div>
  )
}
