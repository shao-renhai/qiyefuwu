# 企业现金流健康诊断 · Design Spec

- **日期**：2026-04-18
- **所属模块**：流水分析 —— 新增「健康诊断层」
- **上游依赖**：`backend/services/analyzer.py`、`backend/services/bank_diagnosis.py`（阶段 A + 年营业额改造 spec）
- **下游（本 spec 不做，预留接口）**：行业基线数据库接入、A→B→C→A 多账户环路检测、拆分归集序列检测
- **关联 spec**：`2026-04-18-bank-annual-revenue-refactor-design.md`（两者独立但在同一报告页呈现）

---

## 1. 背景与动机

### 1.1 问题

当前流水分析只输出"数字是多少"（年营业额、比率、Top 对手方），**没有对现金流本身的健康度做诊断**。12 年顾问经验提炼的 5 个关键信号没被编码：

- 资金停留时长（沉淀率）——现金流周转是否健康、有没有储备
- 收款结构（二维码/对公/个人占比）——是否符合行业典型经营模式
- 资金周转模式（同对手方短期往返）——是否有大量非经营性资金流
- 信用卡资金入账占比——收入结构是否异常
- 大额整数交易占比——资金流转是否符合真实经营的"小数点特征"

### 1.2 目标

为客户提供一份 **"企业现金流健康体检报告"**：像体检中心对血压/血糖/血脂那样客观呈现 5 项核心指标，配上行业健康区间与经营解读，**但不做综合评分、不对客户做价值判断**。

### 1.3 合规红线（本 spec 的最重要一节）

**严格遵守以下 5 条，违反即需立刻回滚**：

| # | 红线 | 含义 |
|---|------|------|
| R1 | **禁止合成总分** | 5 维指标必须独立呈现，不得输出 "0–100 综合得分" / "可信度总评" 等聚合数字 |
| R2 | **禁用审判性词汇** | 下列词**不得出现**在任何用户可见位置（前端文案、API 文本、报告 PDF）：`可信度 / 真实性 / 造假 / 刷流水 / 可疑 / 包装 / 欺诈 / 虚假 / 套现` |
| R3 | **偏离只描述程度** | "偏离状态" 字段值域固定为三档：`持平 / 偏离 / 显著偏离`；**不得**映射到"造假概率/风险等级"等性质判断 |
| R4 | **顾问提醒隔离** | 顾问后台可见的"风险提醒"字段 `advisor_notes`，**严禁**出现在 `/report/{share_token}` 公开接口、打印版 HTML、导出 PDF |
| R5 | **建议限定经营层** | 所有"优化建议"必须是**经营结构改善**（如"月末保留营收 10% 作流动储备"），**不得**指导如何"让造假看起来不像造假" |

违反任意一条 = 平台面临"协助造假"法律风险。所有代码改动需在 PR 描述里逐条自检。

### 1.4 产品立场一句话

> "我们是企业现金流的体检中心。我们报告数字，也对标健康区间，但我们**不下诊断结论、不判断客户动机**。"

---

## 2. 核心设计决策

| # | 决策 | 选择 | 依据 |
|---|------|------|------|
| D1 | 架构路径 | **β**：独立健康诊断层，不修改既有 analyzer/ratios pipeline | 不破坏阶段 A；可独立开关；合规风险隔离 |
| D2 | MVP 指标数 | **5 维** | 信息量足够交叉自解释，且全部"单账户可计算"（不依赖关联方流水） |
| D3 | 综合评分 | **❌ 不做** | 合规 R1 |
| D4 | 循环误伤处理 | **人工确认 + 客户级对手方白名单** | 顾问打勾过程是咨询服务价值的一部分；白名单可沉淀为订阅 stickiness |
| D5 | 顾问侧风险提醒列 | **要**（仅顾问后台可见，分享版/打印版剥离） | 保留专业判断通道；责任在顾问个人，不在平台 |
| D6 | 行业基线 | **预留字段**，MVP 用通用健康区间（写死），未来接入案例库 | 对齐案例知识库建设规划（CLAUDE.md §五） |
| D7 | 银行关注点提示 | **要**（克制措辞："银行审阅时可能要求说明 XX"） | 顾问专业价值体现；合规 R2 不涉及 |

---

## 3. 5 维健康指标定义

所有指标基于**已去重**的交易（即 `is_duplicate=False`），与 annual-revenue spec 同口径。

### 3.1 指标 1 · 资金沉淀率 `retention_ratio`

```
retention_ratio = avg_balance / monthly_avg_income
```
- `avg_balance`：`analysis["avg_balance"]`（已有）
- `monthly_avg_income`：对齐 annual-revenue spec 的 `annual_overview.monthly_avg_income`

**通用健康区间（行业基线占位）**：

| 区间 | 偏离状态 | 经营解读 |
|------|---------|---------|
| `≥ 50%` | `偏离`（过度沉淀） | 资金长时间闲置，可能错失经营投入机会 |
| `20% – 50%` | `持平`（稳健） | 现金储备充裕，抗风险能力强 |
| `5% – 20%` | `持平`（健康） | 资金周转与储备平衡，典型健康经营 |
| `1% – 5%` | `偏离`（储备薄） | 资金周转快但储备弱，抗风险能力偏低；银行审阅时可能关注资金周转模式 |
| `< 1%` | `显著偏离`（储备极薄） | 资金停留时间极短，现金流快进快出；银行审阅时通常会要求补充说明收支节奏与经营模式 |

### 3.2 指标 2 · 收款结构 `income_composition`

按对手方分类统计入账占比（仅统计 `income > 0` 的交易）：

```python
QR_MERCHANT_KEYWORDS = [
    "银联商务", "财付通", "支付宝", "收钱吧", "聚合支付",
    "待清算", "汇付天下", "拉卡拉", "美团商户", "微信支付",
    "快钱", "通联支付", "翼支付",
]
CORPORATE_KEYWORDS = [
    "有限公司", "股份", "集团", "合作社", "事务所",
    "研究院", "中心", "协会", "学校", "医院",
]
# 其余视为"个人/未分类"
```

输出：

```json
{
  "qr_merchant_ratio": 0.68,      // 二维码商户入账占比
  "corporate_ratio":   0.22,      // 对公入账占比
  "personal_ratio":    0.10,      // 个人/未分类占比
  "qr_merchant_amount":  12546000,
  "corporate_amount":     4055000,
  "personal_amount":      1844000
}
```

**偏离判定**：此指标**仅展示结构，不做偏离判定**（因行业差异巨大：零售业 QR 高是健康，贸易业 QR 高是异常）。MVP 阶段只呈现结构分布 + 「参考解读」文案：

> "零售/餐饮行业的二维码商户收款占比通常 ≥ 40%；贸易/制造业通常 ≤ 20%。"

行业自动判定留给阶段 B。

### 3.3 指标 3 · 资金周转模式 `turnover_pattern`

检测"同对手方短期等额往返"。

**算法**：
```python
def detect_short_return(tx_list, max_gap_days=3, amount_tolerance=0.05):
    """
    对同一对手方 counterparty：
      若存在一笔 income=X 在 T 日（对手方 Y）
      且在 [T+1, T+3] 日内存在 expense=X' 给对手方 Y
      且 |X - X'| / X <= 0.05
      → 标记双方交易为 "short_return_pair"

    白名单对手方不参与检测。

    匹配冲突处理（多个候选出账对应同一入账时）：
      1. 优先匹配金额最接近的（|X-X'|/X 最小）
      2. 金额相同时优先匹配时间最近的（gap_days 最小）
      3. 每笔 expense 最多只能被匹配一次（匹配后从候选池剔除）
    """
```

**输出**：
```json
{
  "short_return_ratio": 0.18,                // 被标记往返的入账金额 / 总入账金额
  "short_return_pairs_count": 7,             // 匹配成功的配对数
  "flagged_counterparties": [                // 去重后的涉及对手方列表
    {"name": "某某科技公司", "amount": 850000, "pair_count": 3},
    ...
  ]
}
```

**偏离判定**：

| 区间 | 偏离状态 | 经营解读 |
|------|---------|---------|
| `< 5%` | `持平` | 短期资金往返少，符合真实经营节奏 |
| `5% – 15%` | `偏离` | 存在一定量的短期等额往返，建议准备说明材料解释业务场景 |
| `> 15%` | `显著偏离` | 短期等额往返金额占比较高；银行审阅时可能要求逐笔说明资金用途 |

**白名单机制**（D4）：
- 顾问在报告里可对每个 `flagged_counterparties` 点击「标记为真实业务」，写入客户级对手方白名单
- 下一次报告生成时，白名单内对手方的往返**不参与** `short_return_ratio` 计算
- 白名单可跨客户级报告复用，但不跨客户（A 客户的白名单与 B 客户无关）

### 3.4 指标 4 · 信用卡资金入账占比 `credit_card_inflow_ratio`

```python
CREDIT_CARD_KEYWORDS = [
    "信用卡", "龙卡", "金卡", "白金卡", "钻石卡",
    "奋斗卡", "青年卡", "联名卡",
]
```

对手方或交易描述命中任一关键字 → 标记为「信用卡来源入账」。

```json
{
  "credit_card_inflow_ratio": 0.07,
  "credit_card_inflow_amount": 540000,
  "credit_card_tx_count": 12
}
```

**偏离判定**：

| 区间 | 偏离状态 | 经营解读 |
|------|---------|---------|
| `< 3%` | `持平` | 经营入账来源稳定，信用卡占比低 |
| `3% – 10%` | `偏离` | 信用卡来源入账占比略高，建议说明是否为个人消费周转或员工代付 |
| `> 10%` | `显著偏离` | 信用卡来源入账占比较大；银行审阅时通常会要求说明资金性质 |

### 3.5 指标 5 · 大额整数交易占比 `round_amount_ratio`

```python
def is_round_amount(amount):
    if amount < 10_000:
        return False
    return amount % 10_000 == 0 or amount % 50_000 == 0
```

统计命中的入账笔数占比：

```json
{
  "round_amount_ratio": 0.42,        // 大额整数入账笔数 / 大额入账总笔数
  "round_amount_count": 18,
  "large_income_tx_count": 43        // 分母：income >= 10000 的笔数
}
```

**偏离判定**：

| 区间 | 偏离状态 | 经营解读 |
|------|---------|---------|
| `< 30%` | `持平` | 金额分布符合真实经营（含有大量非整数金额） |
| `30% – 60%` | `偏离` | 大额整数交易比例偏高；常见于部分批发/贸易场景，建议说明业务类型 |
| `> 60%` | `显著偏离` | 大额整数交易占绝大多数；银行审阅时可能关注交易对手方的真实性 |

---

## 4. 报告结构：新增 `health_diagnosis` 块

### 4.1 API 返回值扩展

在 `build_bank_diagnosis_report` 的返回值顶部新增 `health_diagnosis` 块（与 `annual_overview` 平级）：

```json
{
  "annual_overview": { ... },
  "health_diagnosis": {
    "retention": {
      "metric_name": "资金沉淀率",
      "value": 0.008,
      "display": "0.8%",
      "baseline": { "healthy_low": 0.05, "healthy_high": 0.20 },
      "deviation": "显著偏离",
      "interpretation": "资金停留时间极短，现金流快进快出；银行审阅时通常会要求补充说明收支节奏与经营模式",
      "suggestion": "月末保留当月营收 10% 作流动储备",
      "bank_concern": "可能要求补充说明资金周转模式"
    },
    "income_composition": { ... },
    "turnover_pattern": {
      ...,
      "flagged_counterparties": [ ... ],
      "whitelist_action_available": true
    },
    "credit_card_inflow": { ... },
    "round_amount": { ... },

    "advisor_notes": [             // ← 仅顾问可见，公开接口剥离
      { "metric": "retention", "level": "high", "note": "..." },
      ...
    ]
  },
  "overview": { ... },
  "ratios": { ... },
  "risks": [ ... ],
  "suggestions": [ ... ]
}
```

### 4.2 字段规范

所有 5 个指标块共享统一 schema：

```typescript
interface HealthMetric {
  metric_name: string;           // 中文名
  value: number | null;          // 原始比率 0-1
  display: string;               // 预格式化展示字符串
  baseline: {                    // 行业基线占位（MVP 用通用值）
    healthy_low: number;
    healthy_high: number;
  };
  deviation: "持平" | "偏离" | "显著偏离";
  interpretation: string;        // 经营解读（中性措辞）
  suggestion: string;            // 优化建议（经营层面，R5 约束）
  bank_concern: string | null;   // 银行关注点（克制措辞，D7）
}
```

### 4.3 公开接口剥离规则

`GET /api/diagnosis/report/{share_token}` 及打印/导出接口必须执行：

```python
def strip_advisor_notes(report: dict) -> dict:
    """剥离所有仅顾问可见字段。合规红线 R4。"""
    if "health_diagnosis" in report:
        report["health_diagnosis"].pop("advisor_notes", None)
    return report
```

单测 `test_public_report_strips_advisor_notes` 必须覆盖。

---

## 5. 数据模型

### 5.1 新表 `counterparty_whitelist`

```python
class CounterpartyWhitelist(Base):
    __tablename__ = "counterparty_whitelist"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    counterparty_name = Column(String(255), nullable=False)
    note = Column(Text, nullable=True)                # 顾问备注（可选）
    confirmed_by_advisor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("client_id", "counterparty_name", name="uq_whitelist_client_counterparty"),
    )
```

- 迁移脚本：`backend/scripts/migrate_counterparty_whitelist.py`（idempotent inspect + create_all）

### 5.2 `health_diagnosis` 快照存储

`DiagnosisRecord` 已有 `bank_snapshot` JSON 字段，扩展约定：
- 生成诊断报告时，将 `health_diagnosis` 整体存入 `bank_snapshot["health_diagnosis"]`
- 不新增表，沿用现有 JSON 存储

---

## 6. 后端代码改动

### 6.1 新增文件 `services/cashflow_health.py`

```python
"""
企业现金流健康诊断（合规纯诊断层）

严格遵守设计 spec §1.3 的 5 条合规红线：
- R1: 不输出综合评分
- R2: 不使用审判性词汇
- R3: 偏离只描述程度（持平/偏离/显著偏离）
- R4: advisor_notes 须由公开接口层剥离（本模块只标记，不过滤）
- R5: 建议限定经营层
"""

from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from db.database import CounterpartyWhitelist

# ─── 关键字词典（可配置）───────────────────────────────────────
QR_MERCHANT_KEYWORDS = [...]
CORPORATE_KEYWORDS = [...]
CREDIT_CARD_KEYWORDS = [...]

# ─── 基线配置（MVP 用通用值，未来接行业库）─────────────────────
BASELINES = {
    # 沉淀率：完整 5 级（过度沉淀/健康/储备薄/储备极薄）
    "retention": {
        "healthy_low":   0.05,    # >=5% 起算健康
        "healthy_high":  0.20,    # <=20% 健康上沿
        "over_high":     0.50,    # >50% 偏离（过度沉淀）
        "warn_low":      0.01,    # 1%–5% 偏离（储备薄）
        "severe_low":    0.01,    # <1% 显著偏离（储备极薄）
    },
    # 其余三维只有向上偏离的概念，无"太低也不健康"问题
    "short_return": {"healthy_high": 0.05, "warn_high": 0.15},
    "credit_card":  {"healthy_high": 0.03, "warn_high": 0.10},
    "round_amount": {"healthy_high": 0.30, "warn_high": 0.60},
}

# ─── 核心入口 ─────────────────────────────────────────────────
def build_health_diagnosis(
    analysis: Dict[str, Any],
    whitelist: List[str],      # 从 DB 加载的对手方白名单
) -> Dict[str, Any]:
    """
    返回 health_diagnosis 块（含 advisor_notes，由调用方决定是否剥离）。
    """
    return {
        "retention":           _compute_retention(analysis),
        "income_composition":  _compute_income_composition(analysis),
        "turnover_pattern":    _compute_turnover_pattern(analysis, whitelist),
        "credit_card_inflow":  _compute_credit_card_inflow(analysis),
        "round_amount":        _compute_round_amount(analysis),
        "advisor_notes":       _compute_advisor_notes(analysis),  # 内部判断
    }

# ─── 5 个指标计算函数 ──────────────────────────────────────────
def _compute_retention(analysis): ...
def _compute_income_composition(analysis): ...
def _compute_turnover_pattern(analysis, whitelist): ...
def _compute_credit_card_inflow(analysis): ...
def _compute_round_amount(analysis): ...

# ─── 顾问提醒生成（仅内部使用）─────────────────────────────────
def _compute_advisor_notes(analysis) -> List[dict]: ...
```

### 6.2 修改 `services/bank_diagnosis.py`

```python
from services.cashflow_health import build_health_diagnosis
from db.database import CounterpartyWhitelist

def build_bank_diagnosis_report(client, statements, context, db=None):
    # ... 既有逻辑 ...

    # 加载白名单
    whitelist = []
    if db:
        rows = db.query(CounterpartyWhitelist).filter(
            CounterpartyWhitelist.client_id == client.id
        ).all()
        whitelist = [r.counterparty_name for r in rows]

    # 注入健康诊断
    report["health_diagnosis"] = build_health_diagnosis(analysis, whitelist)
    return report
```

### 6.3 新增路由 `routers/bank_statement.py`

```python
# ─── 对手方白名单 CRUD ────────────────────────────────────────

@router.get("/client/{client_id}/counterparty-whitelist")
def list_whitelist(client_id, db, current_user): ...

@router.post("/client/{client_id}/counterparty-whitelist")
def add_whitelist(client_id, payload: WhitelistPayload, db, current_user): ...
    # payload: { counterparty_name: str, note: Optional[str] }

@router.delete("/counterparty-whitelist/{wl_id}")
def remove_whitelist(wl_id, db, current_user): ...
```

### 6.4 修改诊断公开接口（合规 R4）

```python
# routers/diagnosis.py

@router.get("/report/{share_token}")
def get_public_report(share_token, db):
    # ... 既有逻辑 ...
    from services.cashflow_health import strip_advisor_notes
    if record.bank_snapshot and "health_diagnosis" in record.bank_snapshot:
        record.bank_snapshot = strip_advisor_notes(record.bank_snapshot)
    return resp
```

### 6.5 单测清单 `tests/test_cashflow_health.py`

| 用例 | 断言 |
|------|------|
| `test_retention_ratio_healthy` | `avg_balance=200k, monthly_income=1M` → value=0.2, deviation="持平" |
| `test_retention_ratio_severe` | `avg_balance=5k, monthly_income=1M` → value=0.005, deviation="显著偏离" |
| `test_income_composition_qr_dominant` | 对手方含"银联商务" → qr_merchant_ratio 正确 |
| `test_turnover_pattern_detect` | 同对手方入账 100k 后 2 日出账 100k → short_return_ratio > 0 |
| `test_turnover_pattern_whitelist_skip` | 同上但对手方在白名单 → short_return_ratio = 0 |
| `test_credit_card_inflow_keywords` | 对手方含"信用卡" → 被计入 |
| `test_round_amount_counting` | 10k/50k/123456 混合 → 正确统计比例 |
| `test_advisor_notes_generated` | 两维显著偏离 → advisor_notes 有 2 条 |
| `test_public_report_strips_advisor_notes` | 公开接口返回不含 advisor_notes |
| **`test_compliance_no_forbidden_words`** | 扫描所有生成文案，确保不含 R2 禁词 |
| `test_compliance_no_aggregate_score` | 整个 health_diagnosis 块不含数字范围在 0-100 且 key 含 "score/total/rating/credibility" 的字段 |
| `test_whitelist_scoped_to_client` | A 客户白名单不影响 B 客户 |

---

## 7. 前端代码改动

### 7.1 新组件 `HealthDiagnosisCard.tsx`

位置：插在 `AnnualOverviewCard` 之后、原有比率卡之前。

**不使用雷达图**（雷达图隐含综合评分）。采用 **垂直列表 + 每项一个横向状态卡**：

```
┌─ 现金流健康诊断 ────────────────────────────────────────┐
│                                                           │
│ ● 资金沉淀率        0.8%   （健康区间 5%–20%）           │
│   [显著偏离]                                             │
│   资金停留时间极短，现金流快进快出；银行审阅时通常         │
│   会要求补充说明收支节奏与经营模式。                       │
│   💡 建议：月末保留当月营收 10% 作流动储备                │
│   ⓘ 银行关注点：可能要求补充说明资金周转模式              │
│                                                           │
│ ● 收款结构          —                                    │
│   二维码商户 68%  对公 22%  个人 10%                     │
│   参考解读：零售/餐饮行业二维码占比通常 ≥ 40%             │
│                                                           │
│ ● 资金周转模式       18%  （典型区间 < 5%）              │
│   [显著偏离]                                             │
│   短期等额往返金额占比较高；银行审阅时可能要求逐笔         │
│   说明资金用途。                                           │
│   涉及对手方（点击可标记为真实业务）：                    │
│   ├─ 某某科技公司   ¥850,000   [✓ 标记白名单]            │
│   ├─ ...                                                  │
│                                                           │
│ ...                                                       │
└──────────────────────────────────────────────────────────┘
```

### 7.2 顾问后台渲染 `advisor_notes`

```tsx
// 仅当 currentUser.role === 'advisor' 时渲染
{isAdvisor && report.health_diagnosis?.advisor_notes?.length > 0 && (
  <AdvisorNotesPanel notes={report.health_diagnosis.advisor_notes} />
)}
```

**合规自检点**：
- `AdvisorNotesPanel` 组件必须加 `data-advisor-only="true"` 属性，便于打印 CSS 过滤
- 打印 CSS 追加：`@media print { [data-advisor-only] { display: none !important; } }`

### 7.3 白名单操作

`flagged_counterparties` 每行一个 `[✓ 标记白名单]` 按钮，点击调 `POST /counterparty-whitelist`，刷新报告。同时在 Tab「补录数据」下方新增「已确认白名单管理」小面板供顾问管理。

### 7.4 `services/api.ts` 扩展

```typescript
export interface HealthMetric { ... }      // §4.2 定义
export interface HealthDiagnosis { ... }
export interface BankDiagnosisReport {
  // ... 既有字段
  health_diagnosis?: HealthDiagnosis;
}

export interface CounterpartyWhitelistEntry { ... }
export const listWhitelist: (clientId: number) => Promise<...>;
export const addWhitelist: (clientId, payload) => Promise<...>;
export const removeWhitelist: (id) => Promise<...>;
```

---

## 8. 合规自检清单（每次 PR 必过）

本 spec 的**最关键质量门**。PR 提交时必须逐条附上自检结果：

| # | 检查项 | 自动化 |
|---|--------|-------|
| C1 | 无任何 R2 禁词（可信度/真实性/造假/刷流水/可疑/包装/欺诈/虚假/套现）在**用户可见文案**中 | 单测 `test_compliance_no_forbidden_words` 扫全部 interpretation/suggestion/bank_concern 字段 |
| C2 | `health_diagnosis` 块无任何合成评分字段（含 `score/total/rating/credibility/grade` 之类 key） | 单测 `test_compliance_no_aggregate_score` |
| C3 | `deviation` 字段值域严格在 `["持平","偏离","显著偏离"]` | 单测枚举校验 |
| C4 | `advisor_notes` 在 `/report/{share_token}` 接口返回中 = 不存在 | 单测 `test_public_report_strips_advisor_notes` |
| C5 | 打印 CSS / 导出 PDF 不渲染 `[data-advisor-only]` 元素 | 前端 e2e 测（MVP 阶段手动验证 + 截图） |
| C6 | 所有 `suggestion` 字段通过人工 review 确认为经营层建议（不含"如何规避银行审查"等表述） | Code review checklist |

**C1 禁词扫描的严格程度**：大小写不敏感，任何 UTF-8 字符串字段命中即失败。

---

## 9. 验收标准

1. ✅ 上传含"银联商务"对手方的流水 → `qr_merchant_ratio` 正确累加
2. ✅ 同对手方入账 ¥100k 后 2 日出账 ¥98k → 命中 `short_return` 配对
3. ✅ 顾问对某对手方标记白名单 → 下次生成报告时 `short_return_ratio` 不再包含该对手方
4. ✅ `avg_balance=5000, monthly_income=1M` → `retention` deviation=显著偏离
5. ✅ 以普通用户身份调 `/report/{share_token}` → 返回 JSON 中不存在 `advisor_notes` 键
6. ✅ 以顾问身份打开报告页 → 能看到 `AdvisorNotesPanel`
7. ✅ 点击浏览器打印预览 → `AdvisorNotesPanel` 不显示
8. ✅ 合规自检 C1–C6 全绿
9. ✅ 所有新单测 + 既有单测全部通过

---

## 10. 与其他 spec / 阶段的接口

- **与 `2026-04-18-bank-annual-revenue-refactor-design.md` 的关系**：
  - 两者独立，本 spec 读取后者产出的 `annual_overview.monthly_avg_income` 作为沉淀率分母
  - 前端 `HealthDiagnosisCard` 位置在 `AnnualOverviewCard` 之后，两者共用同一个报告页
- **与阶段 B 的接口**：
  - `BASELINES` 字典预留 `industry` 维度（当前只有 default）；阶段 B 接入行业库后可扩展为 `BASELINES[industry][metric]`
  - `income_composition` 的"参考解读"在阶段 B 可按行业自动切换
- **与阶段 C 的接口**：
  - `turnover_pattern` 当前只做"单账户 1-3 日等额往返"；阶段 C 扩展为"多账户环路 A→B→C→A" 需用户上传关联方流水后，作为 `turnover_pattern.multi_account_cycle_ratio` 新子字段并入
  - "拆分归集检测" 同理作为新子维度 `turnover_pattern.split_aggregation_ratio`

---

## 11. 工作量估算

- 后端服务（`cashflow_health.py` + 测试）：~1 人日
- 数据模型（白名单表 + 迁移 + CRUD 路由）：~0.5 人日
- 前端组件（HealthDiagnosisCard + AdvisorNotesPanel + 白名单 UI）：~1 人日
- 合规自检单测 + 打印 CSS：~0.5 人日
- 联调 + 服务器部署验证：~0.5 人日
- **总计：~3.5 人日（约 1 周含 buffer）**

---

## 12. 上线后监控

- **关键指标**（产品侧）：
  - 每份诊断报告平均被标记白名单的对手方数（衡量顾问使用深度）
  - 含显著偏离指标的报告占比（衡量市场客户流水质量画像）
- **合规监控**：
  - 每周扫一遍生产环境所有新生成报告的文本字段，确保无 R2 禁词泄漏
  - 月度 code review 抽查 `suggestion` 字段是否仍符合 R5 约束

---

## 附录 A · 语言术语对照表（开发/文案人员必读）

| ❌ 禁用 | ✅ 使用 |
|-------|-------|
| 洗流水识别 | 现金流健康诊断 |
| 可信度 / 真实性 | ——（直接去掉，描述具体指标即可） |
| 造假 / 虚假 / 刷流水 | 非经营性资金流 / 资金周转模式 |
| 套现 | 信用卡资金入账 |
| 可疑 / 包装 | 偏离行业典型水平 |
| "高度可疑" | "显著偏离" |
| "修复造假" | "优化经营结构" |
| 诊断结论 | 经营解读 |
| 风险等级 | 偏离状态 |
