import type { DiagnosisSection, DimScore } from '../../types/diagnosis'

export const SECTIONS: DiagnosisSection[] = [
  {
    key: 'credit',
    title: 'A · 征信健康度',
    subtitle: '权重 30% · 影响最终可贷额度和产品选择范围',
    weight: 0.30,
    maxRaw: 75,
    questions: [
      {
        id: 'a1',
        label: '近12个月征信硬查询次数',
        options: [
          { label: '0–2次',  score: 30, aiTip: '查询极少，征信优质，可直接冲刺银行优质信用产品，重点问贷款用途和金额。' },
          { label: '3–6次',  score: 20, aiTip: '查询偏高，追问：哪几家机构查的？有无同期获批？未获批记录会加重扣分，建议3个月内暂停新申请。' },
          { label: '7次以上', score: 8,  aiTip: '高风险！银行系统直接降级，需优先修复。追问：有无网贷记录？是否有机构代查情况？' },
        ],
      },
      {
        id: 'a2',
        label: '当前未结清贷款笔数',
        options: [
          { label: '1–3笔',  score: 25, aiTip: '负债结构清晰，银行风控友好。追问各笔期限分布，判断有无集中到期风险。' },
          { label: '4–6笔',  score: 15, aiTip: '多头借贷预警，追问各笔机构类型——银行笔数是否超过3家？小贷和网贷占比？' },
          { label: '7笔以上', score: 5,  aiTip: '多头严重，大额银行贷款几乎无望。需重新规划：先还部分，再申请大额。' },
        ],
      },
      {
        id: 'a3',
        label: '近两年有无逾期记录',
        options: [
          { label: '无逾期',     score: 20, aiTip: '征信清白，加分项。可以此为卖点匹配利率较低的优质产品。' },
          { label: '有但已还清',  score: 10, aiTip: '追问：最近一次逾期距今几个月？6个月内逾期银行仍会重点审查。' },
          { label: '当前仍有逾期', score: 0,  aiTip: '严重风险！银行基本拒贷。必须先处理逾期，至少等3–6个月再申请。' },
        ],
      },
    ],
  },
  {
    key: 'cashflow',
    title: 'B · 经营数据质量',
    subtitle: '权重 25% · 银行审批最核心的还款能力依据',
    weight: 0.25,
    maxRaw: 50,
    questions: [
      {
        id: 'b1',
        label: '对公账户近6个月月均流水',
        options: [
          { label: '50万以下',  score: 8,  aiTip: '流水较低，支撑额度有限。追问：是否有多个对公账户分流？能否集中流水3个月再申请？' },
          { label: '50–300万', score: 18, aiTip: '条件较好。追问：流水中有无大额代收代付？回款是否规律？银行会剔除异常流水重新计算。' },
          { label: '300万以上', score: 25, aiTip: '流水充裕，可申请千万级产品。重点转向纳税和资产情况，这两项决定最终额度上限。' },
        ],
      },
      {
        id: 'b2',
        label: '是否有正规纳税记录',
        options: [
          { label: '有，连续3年以上', score: 20, aiTip: '税贷资格完整！这是成本最低的融资渠道之一，年化利率通常3.5–5%。问：纳税总额多少？是否有出口退税？' },
          { label: '有但不连续',     score: 12, aiTip: '税贷门槛不够，但可走流水贷或抵押类。追问：断缴原因？能否补缴？' },
          { label: '无或极少',       score: 4,  aiTip: '税贷完全关闭，需从其他维度增信。重点看下一步的抵押资源和流水质量。' },
        ],
      },
    ],
  },
  {
    key: 'structure',
    title: 'C · 融资结构合理性',
    subtitle: '权重 20% · 判断是否存在期限错配和集中到期风险',
    weight: 0.20,
    maxRaw: 40,
    questions: [
      {
        id: 'c1',
        label: '现有贷款以短期还是长期为主',
        options: [
          { label: '短期为主（1年内）', score: 6,  aiTip: '短期贷款占比高，若资金用于长期经营，存在滚动续贷压力。追问：每年续贷压力大吗？有没有银行暗示不续了？' },
          { label: '短长期混合',       score: 16, aiTip: '期限结构合理。追问：最近12个月内有多少到期？有无集中还款节点需要提前安排？' },
          { label: '长期为主（3年+）',  score: 20, aiTip: '融资成本稳定，流动性风险低。重点看利率结构——有无高息长期贷款可以置换降成本？' },
        ],
      },
      {
        id: 'c2',
        label: '综合融资年化成本区间',
        options: [
          { label: '8%以下',  score: 20, aiTip: '成本优秀，主要来自银行渠道，结构健康。可在此基础上申请更大额度做业务扩张。' },
          { label: '8–15%',  score: 12, aiTip: '有优化空间。追问：高成本部分是哪些机构？能否用抵押贷款置换小贷？可帮客户测算置换后节省的年利息。' },
          { label: '15%以上', score: 4,  aiTip: '成本过高！大概率有民间或小贷资金。需优先置换降成本，否则贷款额度越大损失越大。' },
        ],
      },
    ],
  },
  {
    key: 'collateral',
    title: 'D · 抵押与增信资源',
    subtitle: '权重 15% · 可撬动银行更大额度的核心资产',
    weight: 0.15,
    maxRaw: 35,
    questions: [
      {
        id: 'd1',
        label: '名下不动产情况',
        options: [
          { label: '有，未全部抵押', score: 20, aiTip: '可直接撬动抵押贷款，是最稳定的增信资源。追问：评估价多少？目前已抵押余额？净值大概多少？' },
          { label: '有，已部分抵押', score: 10, aiTip: '有抵押余值，可评估二押可能性。追问：一押银行是哪家？余值大概多少？部分银行支持二押。' },
          { label: '无',            score: 3,  aiTip: '无不动产，只能走信用类或其他增信。重点看D2政府合同和应收账款，这两项可替代抵押物。' },
        ],
      },
      {
        id: 'd2',
        label: '是否有政府合同或核心企业背书',
        options: [
          { label: '有政府采购合同',   score: 15, aiTip: '政采合同是优质增信！可申请供应链金融，利率极低（3–4%），额度高。追问：合同金额？回款周期？' },
          { label: '有大企业应收账款', score: 10, aiTip: '可走应收账款质押融资，成本优。追问：买方是哪家企业？账期多长？银行对买方资质很敏感。' },
          { label: '无',             score: 4,  aiTip: '无外部背书，依赖自身资质。重点强化前三个维度，特别是流水和纳税记录。' },
        ],
      },
    ],
  },
  {
    key: 'intent',
    title: 'E · 融资意图与时间窗口',
    subtitle: '权重 10% · 决定推荐产品类型和申请策略',
    weight: 0.10,
    maxRaw: 20,
    questions: [
      {
        id: 'e1',
        label: '本次融资主要用途',
        options: [
          { label: '补充流动资金', score: 10, aiTip: '短期信用产品最合适，周转灵活。推荐：信用流贷、税贷、随借随还类产品。' },
          { label: '业务扩张投入', score: 8,  aiTip: '建议匹配中长期产品，避免短贷长用引发流动性危机。追问：扩张回报周期？决定贷款期限建议。' },
          { label: '置换现有贷款', score: 5,  aiTip: '需谨慎规划时间节点，避免断档。追问：旧贷款到期日？需要多少天办理？提前30天开始准备。' },
        ],
      },
      {
        id: 'e2',
        label: '资金需求紧迫程度',
        options: [
          { label: '1个月以上',  score: 10, aiTip: '时间充裕，优先走银行正规流程，成本最低。可以拿这段时间先做数据整理，提高通过率。' },
          { label: '2–4周内',   score: 7,  aiTip: '时间偏紧，优先走已有银行合作关系快速通道，或推荐线上产品（最快3–5个工作日放款）。' },
          { label: '1周内紧急', score: 3,  aiTip: '银行来不及！需先安排过桥资金解燃眉之急，同时并行准备银行申请材料，过桥完成后立即接上银行贷款。' },
        ],
      },
    ],
  },
]

export function calcScores(answers: Record<string, number>): DimScore {
  const raw: Record<string, number> = {}

  for (const section of SECTIONS) {
    const sectionRaw = section.questions.reduce(
      (sum, q) => sum + (answers[q.id] ?? 0),
      0
    )
    raw[section.key] = Math.round((sectionRaw / section.maxRaw) * 100)
  }

  const total = Math.round(
    SECTIONS.reduce((sum, s) => sum + raw[s.key] * s.weight, 0)
  )

  return {
    credit:     raw['credit']     ?? 0,
    cashflow:   raw['cashflow']   ?? 0,
    structure:  raw['structure']  ?? 0,
    collateral: raw['collateral'] ?? 0,
    intent:     raw['intent']     ?? 0,
    total,
  }
}

export function getGrade(total: number) {
  if (total >= 85) return { label: '优秀',  desc: '可冲刺顶级银行产品',   loanMin: 500,  loanMax: 2000, color: '#1D9E75' }
  if (total >= 70) return { label: '良好',  desc: '可申请主流银行产品',   loanMin: 200,  loanMax: 600,  color: '#185FA5' }
  if (total >= 55) return { label: '警示',  desc: '需修复后再申请',       loanMin: 50,   loanMax: 200,  color: '#BA7517' }
  return              { label: '危险',  desc: '建议先整改再融资',     loanMin: 0,    loanMax: 50,   color: '#E24B4A' }
}
