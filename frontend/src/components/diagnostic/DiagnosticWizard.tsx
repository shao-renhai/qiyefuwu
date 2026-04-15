import { useState, useCallback, useEffect } from 'react'
import { Button, Input, Select, message } from 'antd'
import { UserOutlined, PlusOutlined } from '@ant-design/icons'
import axios from 'axios'
import { SECTIONS, calcScores, getGrade } from './diagnosisConfig'
import DiagnosticReport from './DiagnosticReport'
import type { DiagnosisSession, ReportData, ClientItem } from '../../types/diagnosis'

// Use relative URL so nginx proxies to backend
const http = axios.create({ baseURL: '/api' })
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const initSession = (): DiagnosisSession => ({
  diagnosisId:  null,
  clientId:     null,
  clientName:   '',
  companyName:  '',
  currentStep:  -1,
  answers:      {},
  scores:       { credit: 0, cashflow: 0, structure: 0, collateral: 0, intent: 0, total: 0 },
  reportData:   null,
  status:       'idle',
  viewMode:     'advisor',
})

export default function DiagnosticWizard() {
  const [session, setSession] = useState<DiagnosisSession>(initSession)
  const [loading, setLoading] = useState(false)
  const [activeAiTip, setActiveAiTip] = useState<Record<string, string>>({})
  const [clientList, setClientList] = useState<ClientItem[]>([])
  const [clientMode, setClientMode] = useState<'select' | 'new'>('new')

  // 加载客户列表
  useEffect(() => {
    http.get('/clients/').then(({ data }) => {
      setClientList(data)
      if (data.length > 0) setClientMode('select')
    }).catch(() => { /* 忽略 */ })
  }, [])

  const handleStart = useCallback(async () => {
    if (!session.clientName) {
      message.warning('请填写客户姓名')
      return
    }
    if (clientMode === 'new' && !session.companyName) {
      message.warning('请填写公司名称')
      return
    }
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        client_name: session.clientName,
        company_name: session.companyName,
      }
      if (session.clientId) payload.client_id = session.clientId
      const { data } = await http.post('/diagnosis/start', payload)
      setSession(s => ({
        ...s,
        diagnosisId: data.diagnosis_id,
        clientId: data.client_id,
        currentStep: 0,
        status: 'draft',
      }))
    } catch {
      message.error('创建诊断失败，请检查网络')
    } finally {
      setLoading(false)
    }
  }, [session.clientName, session.companyName, session.clientId, clientMode])

  const handleSelect = useCallback((questionId: string, score: number, label: string, aiTip: string) => {
    setSession(prev => {
      const newAnswers = {
        ...prev.answers,
        [questionId]: { label, score, aiTip },
      }
      const rawScores: Record<string, number> = {}
      Object.entries(newAnswers).forEach(([k, v]) => { rawScores[k] = v.score })
      const newScores = calcScores(rawScores)
      return { ...prev, answers: newAnswers, scores: newScores }
    })
    setActiveAiTip(t => ({ ...t, [questionId]: aiTip }))
  }, [])

  const handleFinish = useCallback(async () => {
    if (!session.diagnosisId) return
    setLoading(true)
    try {
      // 发送答案：包含 label + score
      await http.put(`/diagnosis/${session.diagnosisId}`, {
        answers: Object.fromEntries(
          Object.entries(session.answers).map(([k, v]) => [k, { label: v.label, score: v.score }])
        ),
        scores: {
          credit:     session.scores.credit,
          cashflow:   session.scores.cashflow,
          structure:  session.scores.structure,
          collateral: session.scores.collateral,
          intent:     session.scores.intent,
          total:      session.scores.total,
        },
      })

      // 生成报告（后端评分引擎）
      const { data } = await http.post('/diagnosis/report', {
        diagnosis_id: session.diagnosisId,
      })

      setSession(s => ({
        ...s,
        reportData: data as ReportData,
        scores: {
          credit:     data.score_credit     ?? s.scores.credit,
          cashflow:   data.score_cashflow   ?? s.scores.cashflow,
          structure:  data.score_structure  ?? s.scores.structure,
          collateral: data.score_collateral ?? s.scores.collateral,
          intent:     data.score_intent     ?? s.scores.intent,
          total:      data.score_total      ?? s.scores.total,
        },
        status: 'completed',
      }))
      message.success('报告生成成功')
    } catch {
      message.error('生成报告失败')
    } finally {
      setLoading(false)
    }
  }, [session])

  const grade = getGrade(session.scores.total)
  const currentSection = SECTIONS[session.currentStep]

  // ═══ 完成状态：显示报告 ═══
  if (session.status === 'completed' && session.reportData && session.viewMode === 'advisor') {
    return (
      <DiagnosticReport
        data={session.reportData}
        clientName={session.clientName}
        companyName={session.companyName}
        onBack={() => {
          setSession(initSession())
          setActiveAiTip({})
        }}
        onToggleView={() => setSession(s => ({ ...s, viewMode: 'client' }))}
      />
    )
  }

  // ═══ 客户展示模式（转屏）═══
  if (session.viewMode === 'client') {
    const rd = session.reportData
    const clientGrade = rd?.grade || grade
    const clientGradeColor = (typeof clientGrade === 'object' && 'color' in clientGrade) ? clientGrade.color : grade.color
    const clientGradeLabel = (typeof clientGrade === 'object' && 'label' in clientGrade) ? clientGrade.label : grade.label
    const clientGradeDesc = (typeof clientGrade === 'object' && 'desc' in clientGrade) ? clientGrade.desc : grade.desc
    const displayTotal = rd?.score_total ?? session.scores.total
    const displayLoanMin = rd?.loan_min ?? grade.loanMin
    const displayLoanMax = rd?.loan_max ?? grade.loanMax

    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>融资健康评分</div>
        <div style={{ fontSize: 88, fontWeight: 500, color: clientGradeColor, lineHeight: 1 }}>
          {displayTotal}
        </div>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 24, marginTop: 6 }}>
          {clientGradeLabel} · {clientGradeDesc}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, textAlign: 'left' }}>
          {[
            { label: '征信健康', val: rd?.score_credit     ?? session.scores.credit,     color: '#185FA5' },
            { label: '经营数据', val: rd?.score_cashflow   ?? session.scores.cashflow,   color: '#1D9E75' },
            { label: '融资结构', val: rd?.score_structure  ?? session.scores.structure,  color: '#534AB7' },
            { label: '抵押资源', val: rd?.score_collateral ?? session.scores.collateral, color: '#BA7517' },
          ].map(item => (
            <div key={item.label} style={{ background: '#f5f5f5', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: item.color }}>
                {item.val}<span style={{ fontSize: 13, color: '#aaa', fontWeight: 400 }}>/100</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#f0f4ff', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: '#185FA5', fontWeight: 500, marginBottom: 4 }}>预估可贷额度</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: '#185FA5' }}>
            {displayLoanMin}–{displayLoanMax} <span style={{ fontSize: 14, fontWeight: 400 }}>万元</span>
          </div>
        </div>

        {/* 风险标签摘要（客户可见的简版） */}
        {rd && rd.top_priorities && rd.top_priorities.length > 0 && (
          <div style={{ background: 'rgba(226,75,74,0.05)', borderRadius: 8, padding: 16, textAlign: 'left', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#E24B4A', marginBottom: 8 }}>
              需要关注的 {rd.top_priorities.length} 个重点问题
            </div>
            {rd.top_priorities.map((p) => (
              <div key={p.priority} style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                {p.priority}. {p.title}
              </div>
            ))}
          </div>
        )}

        <div style={{ background: '#E6F1FB', borderRadius: 8, padding: 16, textAlign: 'left', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#185FA5', marginBottom: 6 }}>完整报告包含</div>
          <div style={{ fontSize: 13, color: '#185FA5', lineHeight: 2 }}>
            · 每个风险项的具体修复方案<br />
            · 3–6个月融资改善路线图<br />
            · 3款最适合您的银行产品推荐
          </div>
        </div>

        <Button block onClick={() => setSession(s => ({ ...s, viewMode: 'advisor' }))}>
          返回顾问视图
        </Button>
      </div>
    )
  }

  // ═══ 客户信息录入页 ═══
  if (session.currentStep === -1) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>新建融资健康诊断</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>选择已有客户或录入新客户信息</div>

        {/* 客户模式切换 */}
        {clientList.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <Button
              type={clientMode === 'select' ? 'primary' : 'default'}
              icon={<UserOutlined />}
              onClick={() => setClientMode('select')}
              style={{ borderRadius: 8, flex: 1 }}
            >
              选择已有客户
            </Button>
            <Button
              type={clientMode === 'new' ? 'primary' : 'default'}
              icon={<PlusOutlined />}
              onClick={() => {
                setClientMode('new')
                setSession(s => ({ ...s, clientId: null, clientName: '', companyName: '' }))
              }}
              style={{ borderRadius: 8, flex: 1 }}
            >
              新建客户
            </Button>
          </div>
        )}

        {/* 选择已有客户 */}
        {clientMode === 'select' && clientList.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>选择客户</div>
            <Select
              placeholder="搜索或选择客户"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
              value={session.clientId ?? undefined}
              onChange={(val) => {
                const c = clientList.find(c => c.id === val)
                if (c) {
                  setSession(s => ({
                    ...s,
                    clientId: c.id,
                    clientName: c.name,
                    companyName: c.company_name || '',
                  }))
                }
              }}
              options={clientList.map(c => ({
                value: c.id,
                label: `${c.name}${c.company_name ? ' · ' + c.company_name : ''}`,
              }))}
            />
            {session.clientId && (
              <div style={{
                marginTop: 10, padding: '10px 14px', background: 'rgba(201,169,98,0.06)',
                borderRadius: 8, fontSize: 13, color: '#666',
              }}>
                <div><strong>{session.clientName}</strong></div>
                {session.companyName && <div style={{ color: '#888', fontSize: 12 }}>{session.companyName}</div>}
                <div style={{ fontSize: 11, color: '#C9A962', marginTop: 4 }}>
                  如该客户已有征信/流水数据，报告将自动融合真实数据
                </div>
              </div>
            )}
          </div>
        )}

        {/* 新建客户 */}
        {clientMode === 'new' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>客户姓名</div>
              <Input
                placeholder="如：张总"
                value={session.clientName}
                onChange={e => setSession(s => ({ ...s, clientName: e.target.value }))}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>公司名称</div>
              <Input
                placeholder="如：宏达建材有限公司"
                value={session.companyName}
                onChange={e => setSession(s => ({ ...s, companyName: e.target.value }))}
              />
            </div>
          </>
        )}

        <Button type="primary" block loading={loading} onClick={handleStart}
          disabled={!session.clientName || (clientMode === 'new' && !session.companyName)}
        >
          开始诊断
        </Button>
      </div>
    )
  }

  // ═══ 主诊断界面（顾问模式）═══
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600 }}>

      {/* 顶栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '0.5px solid rgba(0,0,0,0.08)', background: '#fff', borderRadius: '12px 12px 0 0',
      }}>
        <div style={{ fontWeight: 500 }}>融资诊断</div>
        <div style={{ flex: 1, fontSize: 13, color: '#666' }}>
          {session.clientName} · {session.companyName}
        </div>
        <Button
          size="small"
          type="default"
          onClick={() => setSession(s => ({ ...s, viewMode: s.viewMode === 'advisor' ? 'client' : 'advisor' }))}
          style={{ borderRadius: 8 }}
        >
          {session.viewMode === 'advisor' ? '转屏展示' : '返回顾问'}
        </Button>
      </div>

      {/* 维度进度条 */}
      <div style={{
        display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        background: '#fff', padding: '0 8px',
      }}>
        {SECTIONS.map((sec, idx) => {
          const isDone = idx < session.currentStep
          const isActive = idx === session.currentStep
          const dimScore = (session.scores as unknown as Record<string, number>)[sec.key]
          return (
            <div
              key={sec.key}
              onClick={() => idx <= session.currentStep && setSession(s => ({ ...s, currentStep: idx }))}
              style={{
                flex: 1, textAlign: 'center', padding: '8px 4px', fontSize: 11,
                cursor: idx <= session.currentStep ? 'pointer' : 'default',
                borderBottom: isActive ? '2px solid #C9A962' : isDone ? '2px solid #36B37E' : '2px solid transparent',
                color: isActive ? '#C9A962' : isDone ? '#36B37E' : '#aaa',
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                {isDone || isActive ? dimScore : '—'}
              </div>
              {sec.title.split('·')[1]?.trim() || sec.title}
            </div>
          )
        })}
      </div>

      {/* 主体：左侧题目 + 右侧实时评分 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 左侧 */}
        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
          {currentSection && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1A2E' }}>{currentSection.title}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{currentSection.subtitle}</div>
              </div>

              {currentSection.questions.map(q => (
                <div
                  key={q.id}
                  style={{
                    background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 10,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11, background: 'rgba(201,169,98,0.1)', color: '#C9A962',
                      padding: '1px 7px', borderRadius: 10,
                    }}>{q.id.toUpperCase()}</span>
                    {q.label}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {q.options.map(opt => {
                      const isSelected = session.answers[q.id]?.label === opt.label
                      return (
                        <button
                          key={opt.label}
                          onClick={() => handleSelect(q.id, opt.score, opt.label, opt.aiTip)}
                          style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                            border: isSelected ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
                            background: isSelected ? 'rgba(201,169,98,0.12)' : 'transparent',
                            color: isSelected ? '#C9A962' : '#555',
                            fontWeight: isSelected ? 500 : 400,
                            transition: 'all .15s',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* AI 追问提示 */}
                  {activeAiTip[q.id] && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px',
                      background: 'rgba(201,169,98,0.08)', borderLeft: '3px solid #C9A962',
                      borderRadius: '0 8px 8px 0', fontSize: 12, color: '#412402', lineHeight: 1.7,
                    }}>
                      <div style={{ fontSize: 11, color: '#C9A962', fontWeight: 500, marginBottom: 3 }}>
                        AI 提示 · 追问建议
                      </div>
                      {activeAiTip[q.id]}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* 右侧实时评分面板 */}
        <div style={{
          width: 240, padding: 16, borderLeft: '0.5px solid rgba(0,0,0,0.08)',
          background: '#fff', overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>实时评分</div>

          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 48, fontWeight: 500, color: grade.color, lineHeight: 1 }}>
              {session.scores.total}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              {grade.label} · {grade.desc}
            </div>
          </div>

          {[
            { label: '征信健康', key: 'credit',     color: '#185FA5' },
            { label: '经营数据', key: 'cashflow',   color: '#1D9E75' },
            { label: '融资结构', key: 'structure',  color: '#534AB7' },
            { label: '抵押资源', key: 'collateral', color: '#BA7517' },
            { label: '融资意图', key: 'intent',     color: '#888780' },
          ].map(({ label, key, color }) => {
            const val = (session.scores as unknown as Record<string, number>)[key] as number
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <div style={{ fontSize: 12, color: '#888', width: 52, flexShrink: 0 }}>{label}</div>
                <div style={{ flex: 1, height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${val}%`, background: color, borderRadius: 3, transition: 'width .5s ease' }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, minWidth: 24, textAlign: 'right' }}>{val}</div>
              </div>
            )
          })}

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>预估可贷额度</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>
              {grade.loanMin}–{grade.loanMax}
              <span style={{ fontSize: 12, fontWeight: 400, color: '#aaa' }}> 万</span>
            </div>
          </div>
        </div>
      </div>

      {/* 底部导航 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderTop: '0.5px solid rgba(0,0,0,0.08)', background: '#fff', borderRadius: '0 0 12px 12px',
      }}>
        <Button
          disabled={session.currentStep === 0}
          onClick={() => setSession(s => ({ ...s, currentStep: s.currentStep - 1 }))}
          style={{ borderRadius: 8 }}
        >
          上一步
        </Button>
        <div style={{ flex: 1, fontSize: 12, color: '#aaa', textAlign: 'center' }}>
          第 {session.currentStep + 1} 步，共 {SECTIONS.length} 步 · {currentSection?.title}
        </div>
        {session.currentStep < SECTIONS.length - 1 ? (
          <Button
            type="primary"
            onClick={() => setSession(s => ({ ...s, currentStep: s.currentStep + 1 }))}
            style={{ borderRadius: 8 }}
          >
            下一步
          </Button>
        ) : (
          <Button type="primary" loading={loading} onClick={handleFinish} style={{ borderRadius: 8 }}>
            生成报告
          </Button>
        )}
      </div>
    </div>
  )
}
