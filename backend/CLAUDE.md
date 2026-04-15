# 云上融企业服务平台 · CLAUDE.md
# 项目共享上下文文档 · Claude Code 启动时自动读取

---

## 一、项目背景与战略定位

### 创始人背景
- 企业融资规划服务领域从业 **12年**
- 核心能力：银行产品库 + 审批逻辑 + 企业数据整合规划
- 核心资产：数百个真实融资案例（踩坑模式、成功路径、决策经验）
- 服务对象：中小企业、个体户（年营收50万～亿级均有）
- 团队：有团队，目标 AI 赋能团队规模化复制

### 产品战略方向
从"事后救火型一次性交易" → "企业融资健康持续订阅管理"

核心转变：
- 获客时机前移：在企业乱融资之前建立关系
- 服务从"解决问题"升维为"持续健康管理"
- 商业模式：一次性收费 → 订阅制（基础/成长/战略三档）
- AI 赋能团队：单人服务客户量从 20 家 → 100 家

### 三阶段路径
- 阶段一（0–6个月）：立信 · 免费 AI 融资诊断工具 + 案例知识库沉淀
- 阶段二（6–18个月）：造血 · 订阅制上线（299/月 · 1500/月 · 8000/月）
- 阶段三（18个月+）：裂变 · 顾问入驻生态 + 机构合作 + SaaS 对外输出

---

## 二、技术栈

### 前端
```
框架：      React 19.2.4 + TypeScript
构建工具：  Vite 8
UI 组件库： Ant Design 5
路由：      无路由库，用 state 做页面切换
图表：      ECharts 6 + echarts-for-react 3
HTTP：      Axios
```

### PageKey 类型（新增页面时更新）
```typescript
type PageKey = 'dashboard' | 'credit' | 'bank' | 'calculator' | 'diagnostic'
```

### 后端
```
语言：      Python
框架：      FastAPI
数据库：    SQLite（SQLAlchemy ORM）
服务器：    Uvicorn（127.0.0.1:8000）
认证：      JWT（JSON Web Token）
PDF/OCR：  解析征信报告和银行流水
部署：      systemd 服务（qiyefuwu），Nginx 反向代理
```

### 现有模块状态
| 模块 | 状态 | 备注 |
|------|------|------|
| 征信分析 | **已完成 v2** | 三层架构：原件图库 + 数据录入 + 分析报告 |
| 流水分析 | 已完成，独立 API | 可直接调用 |
| 贷款计算器 | 已完成 | 前端页面 |
| 融资诊断 | **已完成** | 问卷 + 评分 + 报告 + 数据融合 |
| 评分引擎 | 已完成 | backend/services/scoring_engine.py |
| 客户管理 | 已完成 | 去重逻辑 + 征信/流水/诊断关联 |

---

## 三、融资健康诊断模块

### 文件结构
```
frontend/src/
├── types/
│   └── diagnosis.ts                    # TS 类型定义 ✓
├── components/diagnostic/
│   ├── diagnosisConfig.ts              # 题库 + 前端轻量评分 ✓
│   └── DiagnosticWizard.tsx            # 主组件，双模式（顾问/客户转屏）✓

backend/
├── models.py                           # 追加 DiagnosisRecord 数据表 ✓
├── routers/
│   └── diagnosis.py                    # 3个 API 端点 ✓
└── services/
    ├── scoring_engine.py               # 后端深度评分引擎 ✓（今日更新）
    └── calibration.py                  # 权重校准工具 ✓
```

### 架构决策
- 前端评分：diagnosisConfig.ts 的 calcScores() 纯函数，点击选项即时更新，零延迟
- 后端评分：scoring_engine.py 的 ScoringEngine，生成报告时运行，产出完整风险分析
- 两套互补：前端轻量实时 → 后端深度分析，最终报告以后端为准

### 三个后端 API 节点
```
POST /api/diagnosis/start       # 节点①：创建诊断会话，返回 diagnosis_id
GET  /api/diagnosis/verify/{id} # 节点②：调用现有征信/流水 API 做数据核验
POST /api/diagnosis/report      # 节点③：保存记录，调用 ScoringEngine，设置90天回访提醒
```

### 待完成任务（按优先级）
1. 接入 App：DiagnosticWizard 挂进页面切换，侧边菜单加入口
2. 补 PUT 端点：PUT /api/diagnosis/{id} 保存答案和分数
3. 对接评分引擎：POST /api/diagnosis/report 调用 ScoringEngine.score()
4. 对接现有 API：diagnosis.py 的 verify_data() 函数里有注释，确认 credit_service 和 cashflow_service 的函数名后取消注释
5. 开发报告页面：基础版（免费）+ 完整版（付费/订阅解锁）

---

## 四、评分引擎（重要，今日大幅更新）

### 文件位置
`backend/services/scoring_engine.py`

### 征信维度规则来源
以下规则来自创始人12年真实案例提炼，是系统最核心的竞争壁垒：

#### A1 查询维度（三时间窗口分层）
```python
QUERY_THRESHOLDS = {
    "1m":  (3, 5),    # 近1个月：警戒≥3次，红线≥5次
    "3m":  (5, 8),    # 近3个月：警戒≥5次，红线≥8次
    "6m":  (7, 11),   # 近6个月：警戒≥7次，红线≥11次
}
# 机构类型权重：银行1.0 / 消金1.5 / 网贷2.0（网贷直接触发降级）
# 同日集中查询≥3次：主动申请预警
# 助贷同天多家申请：银行有豁免逻辑，可提供证明申请豁免
# 贷后管理查询剔除不计，担保审查纳入计算
```

#### A2 负债维度
```python
# 负债率 = 负债总额 ÷ 月均流水×12
# 收入覆盖度 = 月还款 ÷ (月均流水 × 行业系数)
DEBT_RATIO_THRESHOLDS = {"safe": 0.50, "warning": 0.70}
COVERAGE_THRESHOLDS   = {"safe": 0.50, "warning": 0.70}

# 行业系数（流水×系数=银行认定月收入）
INDUSTRY_CASHFLOW_RATIO = {
    "trade": 0.20, "restaurant": 0.40, "service": 0.50,
    "manufacture": 0.35, "construction": 0.30, "retail": 0.30,
    "medical": 0.55, "tech": 0.60, "default": 0.40,
}
# 担保金额全额计入负债；企业贷款法人担保同等处理
```

#### A3 逾期维度（时间窗口+一票否决）
```python
# 当前逾期：一票否决，直接拒
# 连三累六：一票否决，等同当前逾期
# 近1年逾期：影响大，只能匹配仅看近2年数据的产品
# 1–2年前逾期：可解释，选城商行/农商行
# 2年前逾期：基本忽略
# 逾期记录无法删除，只能等时间自然消退
```

#### A4 信用卡维度
```python
CREDIT_CARD_THRESHOLDS = {"safe": 0.60, "warning": 0.70}
# 大额账单分期全额计入负债（装修贷、消费贷同等处理）
```

#### A5 担保维度
```python
# 看关系、金额、状态三个维度
# 全额计入负债计算
# 企业贷款法人担保同等处理
```

#### 修复周期表
```python
REPAIR_TIMELINE = {
    "query_excess":    "养满6个月再申请",
    "card_usage_high": "还至70%以内，等下期账单更新（约1个月）",
    "overdue_current": "还清后等1个月征信更新，再评估",
    "overdue_recent":  "无法加速，只能匹配仅看近2年数据的产品",
    "debt_ratio_high": "还款降负债率至70%以内，至少1个月流水验证",
}
```

### ScoringInput 关键字段（今日新增）
```python
# 征信查询：按时间窗口分层
query_1m, query_3m, query_6m: int
bank_query_count, consumer_query_count, p2p_query_count: int
same_day_max_queries: int

# 逾期：精细化
has_lian3_lei6: bool          # 连三累六
overdue_months_ago: Optional[int]  # 最近逾期距今月数

# 负债
total_debt: float              # 负债总额（万元，含担保）
monthly_payment: float         # 月还款额
guarantee_amount: float        # 对外担保（全额计入负债）
large_installment_amount: float  # 大额分期余额

# 信用卡
credit_card_usage: Optional[float]  # 综合使用率 0–1

# 行业（用于收入系数）
industry: str
```

### 后端调用方式
```python
from services.scoring_engine import ScoringEngine, ScoringInput
engine = ScoringEngine()
result = engine.score(inp)
# result 包含：dims / final_total / grade / loan_range / risk_flags / top_priorities
```

### 权重校准
```bash
cd backend/services
python calibration.py  # 首次运行生成模板，填入历史案例后再次运行输出校准报告
```

---

## 五、知识库建设规划

### 三类知识形态
- 规则型知识：已编码进 scoring_engine.py 的 PENALTY_RULES / BONUS_RULES
- 案例型知识：待录入，用于校准评分权重（目标：先积累50个结构化案例）
- 表达型知识：待提炼，用于 AI 生成报告的语气模板

### 案例录入字段（20个核心字段）
行业/规模/企业年龄/征信状态/月均流水/纳税情况/抵押资产
来访原因/核心问题/紧迫程度/目标金额
方案类型/推荐银行/前置动作/耗时
结果/获批额度/实际利率/银行层级/核心教训

### AI 接入两阶段
- 阶段一（现在）：Prompt注入，把规则和案例写进 System Prompt，直接可用
- 阶段二（50个案例后）：RAG检索，向量数据库（Chroma）语义搜索相似案例

### 报告生成 Prompt 结构
```
角色：有12年经验的企业融资规划顾问
输入：{diagnosis_result} + {similar_cases}
输出要求：
  - 每个高风险项：为什么是风险（1句）+ 不处理会怎样（1句）+ 修复步骤（3步以内）
  - 融资路线图：0–3月/3–6月/6月后，每阶段1–2个具体动作
  - 产品推荐：3款，含银行名/产品名/预估通过率/利率区间/所需材料
  - 语气：专业直接有温度，像顾问面谈，不像AI生成
  - 禁止：不说"我认为"、不说"可能"、不出现不确定词汇
```

---

## 六、产品规划（后续迭代）

### 报告模块（下一个大模块）
- 免费基础报告：总分 + 雷达图 + 风险项数量（不含详情和解决方案）
- 付费完整报告（299–499元 或 订阅解锁）：
  - 每项风险根因 + 修复方案（来自 risk_flags[].action 字段）
  - 3–6个月融资路线图（时间轴展示）
  - 3–5款精准银行产品匹配清单

### 订阅系统（阶段二）
| 档位 | 价格 | 核心功能 |
|------|------|---------|
| 基础订阅 | 299–499元/月 | 征信监控预警 + AI问答 |
| 成长订阅 | 1500–2999元/月 | 融资健康报告 + 专属顾问月度复盘 |
| 战略订阅 | 8000–20000元/月 | 全年融资规划托管 + 银行关系对接 |

---

## 七、开发规范

- 前端：TypeScript 严格模式，函数式组件 + Hooks，Ant Design 5
- 后端：FastAPI 路由按业务模块拆分，统一 Depends 注入 db 和 current_user
- 题库配置只在 diagnosisConfig.ts 维护
- 评分规则只在 scoring_engine.py 的配置区维护，不动逻辑代码
- API 前缀：/api/，认证：Authorization: Bearer {token}
- 错误返回：{"detail": "错误描述"}

---

## 八、当前优先任务（按顺序执行）

1. ~~把 DiagnosticWizard 接入 App~~ ✅ 已完成
2. ~~补 PUT /api/diagnosis/{id} 端点~~ ✅ 已完成
3. ~~把 ScoringEngine 接入 POST /api/diagnosis/report~~ ✅ 已完成
4. ~~对接现有征信/流水 API~~ ✅ 已完成（三方数据融合已验证）
5. ~~征信分析增强（原件图库 + 数据录入 + 分析报告）~~ ✅ 已完成
6. 开发付费报告页面（免费基础版 + 付费完整版分享链路）
7. 建立案例录入界面（供团队录入历史案例，用于校准权重）
8. 融资诊断 manual_data 优先级接入（diagnosis.py 的 _answers_to_input 增加 manual_data 最高优先级）

---

## 九、开发日志

### 2026-04-10（第一轮大部署）
- 融资诊断模块全流程部署：问卷 → 评分引擎 → 报告生成
- DiagnosticWizard 接入 App 页面切换
- 后端 diagnosis.py 三个端点上线
- 评分引擎 ScoringEngine 对接完成

### 2026-04-11（数据融合 + Bug修复）
- 三方数据融合验证通过：征信 + 流水 + 问卷 → 评分引擎
- Bug修复：选择已有客户后诊断按钮不可点击
- 客户去重：后端 POST /clients/ 同名自动复用
- 上传去重：征信/流水重复上传自动取最新
- 服务器重复客户清理（谢兴浩11→1、梁小敏、苏总）

### 2026-04-13（征信分析设计）
- 征信报告解析问题诊断：OCR不精确，parser不提取机构名
- 征信分析增强方案设计完成：三层架构确认
- 后端新文件创建（未部署）：credit_image.py, credit_analysis.py

### 2026-04-16（征信分析 v2 完整部署）
- **后端部署**：
  - database.py：新增 CreditImage 模型 + CreditReport 添加 manual_data/manual_mode 字段
  - credit_image.py：图片库完整 API（上传/列表/查看/删除）
  - credit_report.py：新增手动数据录入/读取 + 分析报告生成 + 按客户获取最新报告
  - credit_analysis.py：完整分析报告引擎（概览/负债结构/风险预警/优化建议）
  - clients.py：去重逻辑
  - main.py：注册 credit_image 路由
  - SQLite 迁移：ALTER TABLE + CREATE TABLE credit_images
- **前端部署**：
  - api.ts：新增 CreditImage/AnalysisReport 类型 + 8个新 API 函数
  - CreditAnalysis.tsx：完全重构为 Tabs 布局
    - Tab 1 原件图库：批量上传、网格缩略图、全屏查看器、上下翻页
    - Tab 2 数据录入：快速/详细模式切换、基础指标+信用卡+查询记录表单、在贷机构明细可编辑表格
    - Tab 3 分析报告：概览卡片、风险预警（高/中/低三级）、负债结构表格、优化建议、打印支持
  - 客户选择器：搜索选择已有客户或新建

---

## 十、征信分析模块详细架构

### API 端点
```
POST /api/credit-report/upload              # 上传征信报告（PDF/图片，自动解析）
PUT  /api/credit-report/{id}/manual          # 保存手动录入数据
GET  /api/credit-report/{id}/manual          # 获取手动+解析数据
GET  /api/credit-report/{id}/analysis-report # 生成分析报告（融合 manual+parsed）
GET  /api/credit-report/client/{client_id}   # 获取客户最新征信报告

POST   /api/credit-image/upload              # 上传原件图片
GET    /api/credit-image/{client_id}          # 列出客户所有图片
GET    /api/credit-image/file/{filename}      # 查看图片文件
DELETE /api/credit-image/{image_id}           # 删除图片
```

### 数据优先级
```
manual_data（手动录入）> parsed_data（OCR自动解析）> 问卷估算值
```

### 风险预警阈值
| 指标 | 警戒线(medium) | 红线(high) |
|------|---------------|-----------|
| 在贷机构数 | > 4家 | > 6家 |
| 负债率 | > 60% | > 80% |
| 信用卡使用率 | > 70% | > 90% |
| 近6月查询次数 | > 4次 | > 8次 |
| 当前逾期 | - | 一票否决 |

### 文件清单
```
backend/services/credit_analysis.py   # 分析报告生成引擎
backend/routers/credit_report.py      # 征信报告路由（含手动数据+分析报告）
backend/routers/credit_image.py       # 原件图库路由
backend/db/database.py                # CreditImage模型 + CreditReport扩展字段
frontend/src/pages/CreditAnalysis.tsx  # 三Tab前端页面
frontend/src/services/api.ts          # API函数+类型定义
```
