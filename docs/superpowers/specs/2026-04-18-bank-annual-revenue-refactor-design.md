# 流水分析「年营业额化」改造 · Design Spec

- **日期**：2026-04-18
- **所属模块**：流水分析（阶段 A 的延续）
- **上游**：`backend/services/bank_diagnosis.py`、`backend/routers/bank_statement.py`、`frontend/src/pages/BankAnalysis.tsx`
- **下游（本 spec 不做，仅预留接口）**：三方数据打通梳理（单独立 spec）、阶段 B 行业系数、阶段 C 工资/税费识别

---

## 1. 背景与动机

### 1.1 当前问题
流水分析阶段 A 上线后，首批客户数据暴露两个结构性问题：

1. **`loan_cover_ratio` 语义反直觉、数值失控**
   - 现公式：`月均流水 / 目标贷款金额`
   - 语义是「流水越大 → 比率越大 → 越健康」，**数字越大越健康违反产品直觉**（用户普遍期望"数字 ↑ 风险 ↑"）
   - 实测出现 `1123.9%` 这类极端值，客户无法判断这是好还是坏
   - 根因：用户把「目标贷款金额」按"万"填成 `100`（心里装着"100 万"），而字段是"元"，导致分母比正确值小 10000 倍

2. **报告顺序与银行风控阅读顺序不一致**
   - 现报告首屏是「月均比率 + 5 个指标」，但银行客户经理/风控审阅流水的第一句话永远是：**"这家企业年营业额多少？"**
   - 缺少"年营业额 → 体量段位"这一层定性定位，客户看不到自己"属于哪个段"
   - "10 倍原则"的真实银行话术其实是「年营业额 ≥ 贷款金额」（或更保守 `loan ≤ 年营业额 × 0.3~0.8`），我们之前把它翻译成了「月均流水 × 10 ≥ 贷款」，导致分母翻译走形

### 1.2 目标
把流水分析报告的首屏和核心比率重构为**银行风控口径的年营业额 + 月度拆解 + 风险分层**，同步修掉 `loan_cover_ratio` 的语义问题与 1123.9% bug。

### 1.3 非目标（YAGNI）
- 行业中位数对比 → 阶段 B
- 用户可切换数据窗口（近 6 月/近 12 月/全部） → 阶段 B
- 工资/税费/社保识别 → 阶段 C
- 三方数据（流水/征信/诊断）混乱点的整体梳理 → 另立 spec

---

## 2. 核心设计决策

| # | 决策 | 取值 | 依据 |
|---|------|------|------|
| D1 | 数据 < 12 月时的展示策略 | **方案 C**：主位「近 N 月累计」+ 副位「≈ 年化参考」 | 兼顾银行真实窗口与顾问话术；季节性行业简单 ×2 会严重失真，故年化仅作参考而非主数字 |
| D2 | 年营业额金额口径 | **主数字 = `deduped_total_income`（业务性流入）** + 可展开「账面 / 业务性 / 剔除率」详情 | 业务性数字接近银行客户经理二次整理后的"干净流水"，是产品核心 value-add；同时可展开的详情把"我们替你做了什么整理"显性化 |
| D3 | 数据窗口选择策略 | **方案 B**：主按**近 12 月**算（与银行口径 100% 对齐），> 12 月数据作全周期副信息，< 12 月走 D1 降级 | 银行风控只看近 1 年；老数据不浪费，顾问复盘可用 |
| D4 | 贷款覆盖率重构 | **公式反转为 `目标贷款 / 年营业额`**，语义 `lower_better` | 语义符合"数字 ↑ 风险 ↑"直觉；与顾问口头话术一致（"你想贷 500 万，年营业额才 600 万，占 83%，风险高"）；数值天然 clamp 在合理区间 |
| D5 | 阈值组（皆为可配置参数） | 见 §5 | 来自创始人 12 年案例经验默认值，可在 `THRESHOLDS` dict 单点调参 |

---

## 3. 数据模型：报告新增字段

在 `build_bank_diagnosis_report` 返回值顶部新增 `annual_overview` 块，其他字段保持兼容：

```json
{
  "client_name": "...",
  "annual_overview": {
    "window_months": 12,
    "window_start": "2025-05",
    "window_end":   "2026-04",

    "annual_revenue": 18450000,
    "annual_revenue_raw": 22100000,
    "self_transfer_amount": 3650000,
    "self_transfer_ratio": 0.165,

    "monthly_avg_income": 1537500,

    "size_tier": "medium",
    "size_tier_label": "中型（500 万–3000 万）",

    "is_annualized": false,
    "annualized_hint": null,

    "full_window_months": 18,
    "full_window_revenue": 26300000
  },
  "overview": { ... },
  "ratios": { ... },
  "risks": [ ... ],
  "suggestions": [ ... ]
}
```

### 字段语义说明

| 字段 | 定义 |
|------|------|
| `window_months` | 实际参与年营业额计算的月数，**封顶 12** |
| `window_start` / `window_end` | 参与计算的月份起止（YYYY-MM） |
| `annual_revenue` | **业务性年营业额**（主数字）= 在计算窗口内 `deduped_total_income` 的求和 |
| `annual_revenue_raw` | 账面累计 = 同窗口内 `total_income`（含自转） |
| `self_transfer_amount` | `annual_revenue_raw - annual_revenue`（剔除金额） |
| `self_transfer_ratio` | `self_transfer_amount / annual_revenue_raw`，0–1，展示时 ×100 |
| `monthly_avg_income` | `annual_revenue / 12`（数据满 12 月时）或 `annual_revenue / window_months`（数据不足时） |
| `size_tier` | 体量段位枚举：`micro` / `small` / `medium` / `large` / `xlarge` |
| `size_tier_label` | 中文段位标签，含区间说明 |
| `is_annualized` | `true` = 数据不足 12 月，主数字是"近 N 月累计"+ 副位做了年化；`false` = 数据 ≥ 12 月，主数字是真实近 12 月累计 |
| `annualized_hint` | 当 `is_annualized=true` 时给出字符串如 `"≈ 年化 ¥6,148,000（×2 估算）"`，否则 `null` |
| `full_window_months` | 用户上传的所有流水的跨度月数（可能大于 12） |
| `full_window_revenue` | 全周期累计业务性流入；当 `full_window_months <= 12` 时 = `annual_revenue`，大于时才展示差异 |

---

## 4. 比率重构：`loan_cover_ratio`

### 4.1 语义反转

```python
# 旧
loan_cover_ratio = monthly_avg_income / target_loan_amount   # higher_better
THRESHOLDS["loan_ratio"] = {"healthy": 0.10, "warn": 0.05}   # 健康 ≥ 10%

# 新（重命名为 loan_coverage_ratio，保留旧字段 1 个版本作兼容 alias）
loan_coverage_ratio = target_loan_amount / annual_revenue    # lower_better
THRESHOLDS["loan_coverage"] = {"healthy": 0.30, "warn": 0.80} # 健康 ≤ 30%
```

### 4.2 分级规则

| 值域 | 等级 | 含义 |
|------|------|------|
| `≤ 0.30` | `low`（健康） | 贷款不超过年营业额的 30%，银行标准保守额度 |
| `0.30 < x ≤ 0.80` | `medium`（警戒） | 贷款占年营业额 30–80%，需抵押物或强担保 |
| `> 0.80` | `high`（高风险） | 贷款接近或超过年营业额，大概率过不了初审 |

### 4.3 特殊异常检测（新增）

用阈值常量 `UNIT_MISMATCH_THRESHOLD = 0.001`（= 贷款占年营业额 0.1%）：

- **当 `loan_coverage_ratio is not None` 且 `loan_coverage_ratio < UNIT_MISMATCH_THRESHOLD`**：
  额外挂一条 `level: "low", category: "金额异常"` 的提示（**不替代** 正常 low 分级，而是叠加）：
  > "目标贷款金额相对年营业额过小（< 0.1%），请核对金额单位是否为元（常见错误：把'100 万'填成了'100'）"
- **当 `annual_revenue == 0 or target_loan_amount is None`** → `loan_coverage_ratio = None`，挂标准「数据缺失」低优先级提示（与其他 `None` 比率规则一致）

阈值常量写入 `THRESHOLDS["loan_coverage"]["unit_mismatch"]`，方便后续调优。

### 4.4 UI 文案变化

| 位置 | 旧 | 新 |
|------|----|----|
| 卡片标题 | 贷款匹配度 | 贷款覆盖率（占年营业额） |
| 卡片副标题 | 月均流水 / 目标贷款（银行 10 倍原则，应 ≥ 10%） | 目标贷款 / 年营业额（银行标准，应 ≤ 30%） |
| 颜色规则 | 越大越绿 | 越小越绿 |
| 风险 title | 月均流水 / 目标贷款额 仅 X% | 目标贷款占年营业额 X%（警戒/高风险） |

---

## 5. 阈值配置（全部可配置，单点调参）

```python
# services/bank_diagnosis.py
THRESHOLDS = {
    # ── 既有 ──
    "coverage":    {"healthy": 2.0,  "warn": 1.5},
    "balance":     {"healthy": 0.20, "warn": 0.10},
    "volatility":  {"healthy": 0.30, "warn": 0.50},
    "low_balance": {"healthy": 0.10, "warn": 0.05},

    # ── 新 ──
    "loan_coverage": {"healthy": 0.30, "warn": 0.80, "unit_mismatch": 0.001},  # 反转后语义 + 单位误填提示线

    # ── 体量段位（按业务性年营业额，单位：元） ──
    "size_tier": {
        "micro":  500_000,        # < 50 万
        "small":  5_000_000,      # 50 万 – 500 万
        "medium": 30_000_000,     # 500 万 – 3000 万
        "large":  100_000_000,    # 3000 万 – 1 亿
        # > 1 亿 = xlarge
    },

    # ── 数据窗口不足提示（严格小于边界值时触发）──
    "window_adequacy": {
        "warn_below_months":   12,   # window < 12 → low 级提示（6–11 月）
        "severe_below_months":  6,   # window < 6  → 覆盖升级为 medium 级
        # window >= 12：不提示
    },
}
```

**废弃字段**：`THRESHOLDS["loan_ratio"]` 保留 1 个版本作兼容（旧调用点返回 `None`），下一次迭代删除。

---

## 6. 后端代码改动

### 6.1 新增函数

```python
# services/bank_diagnosis.py

def compute_annual_overview(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    基于 analysis（analyzer.analyze_bank_statement 返回值）计算年营业额及体量段位。
    从 analysis["monthly_summary"] 读取月度汇总。

    规则：
    - 从 monthly_summary 按 YYYY-MM 倒序取最近 min(len, 12) 条作为"近 12 月窗口"
    - annual_revenue = sum(m["deduped_income"] for m in selected)
      （analyzer 须在 monthly_summary 中携带 deduped_income；无此字段时退回 m["income"] 并打 warning 日志）
    - 若 len(monthly_summary) < 12：
        is_annualized = True
        annualized_hint = f"≈ 年化 ¥{annual_revenue * 12 / len:,.0f}（×{12/len:.1f} 估算）"
    - size_tier 按 THRESHOLDS["size_tier"] 分档（micro/small/medium/large/xlarge）
    - full_window_months = len(monthly_summary)；full_window_revenue 同口径全量求和
    """
```

### 6.2 修改点清单

- **`services/bank_diagnosis.py`**
  - `compute_ratios`：删除 `loan_cover_ratio`，新增 `loan_coverage_ratio`（分子分母反转）
  - `_level_for` 调用：改为 `"lower_better"` 方向
  - `build_risks_and_suggestions`：
    - 原「目标贷款匹配」规则改名「贷款覆盖率」，文案按 §4.4 重写
    - 新增「目标贷款金额异常小」特殊提示（§4.3）
    - 新增「数据窗口不足」规则（§5 的 `window_adequacy` 阈值驱动）
  - `build_bank_diagnosis_report`：在返回 dict 顶部挂 `annual_overview = compute_annual_overview(...)`
- **`services/analyzer.py`**
  - `monthly_summary` 新增 `deduped_income` / `deduped_expense` 字段（当前只有 `income` / `expense`），便于窗口截断后的去重求和
  - 单测：补 `test_analyzer_monthly_deduped_fields`

### 6.3 单测增补（`tests/test_bank_diagnosis.py`）

| 用例 | 断言 |
|------|------|
| `test_annual_overview_full_12_months` | 12 月流水 → `window_months=12`, `is_annualized=False`, `size_tier` 正确分档 |
| `test_annual_overview_partial_6_months` | 6 月流水 → `window_months=6`, `is_annualized=True`, `annualized_hint` 非空 |
| `test_annual_overview_over_12_months` | 18 月流水 → `window_months=12`（截断），`full_window_months=18`，`full_window_revenue > annual_revenue` |
| `test_annual_overview_zero` | 空流水 → `annual_revenue=0`, `size_tier="micro"`, `loan_coverage_ratio=None` |
| `test_loan_coverage_semantic_reversal` | `target=600000`, `annual=2000000` → ratio=0.30 → `low`；ratio=0.85 → `high` |
| `test_loan_coverage_unit_mismatch_hint` | `target=100`（万当元填）+ `annual=1000000` → 额外挂"金额单位"提示 |
| `test_window_adequacy_warnings` | `window=5` → medium 级；`window=8` → low 级；`window=12` → 无提示 |

---

## 7. 前端代码改动

### 7.1 `pages/BankAnalysis.tsx`

**报告页顶部新增 `AnnualOverviewCard` 组件**（插在当前 4 张比率卡之前）：

```
┌──────── 年营业额 ────────────────────────┐
│  ¥ 18,450,000                              │
│  ┌─ 体量段位：中型（500 万–3000 万）─┐  │
│  数据窗口：2025-05 ~ 2026-04（近 12 月）   │
│  月均进账：¥ 1,537,500                     │
│                                             │
│  [ 展开：账面 vs 业务性 vs 剔除率 ]        │
└────────────────────────────────────────────┘
```

- 数据不足 12 月时：主数字标题变为「近 N 月累计」，下方黄字副位「≈ 年化 ¥X（×K 估算）」
- 数据 > 12 月时：底部补一行灰字「全周期 18 月累计 ¥26,300,000」
- 展开面板三项数据 + 剔除率进度条

**`RatiosSection` 内第 4 张卡**：
- 标题改 `贷款覆盖率（占年营业额）`
- Tooltip 改 `目标贷款 / 年营业额 · 银行标准应 ≤ 30%`
- 数值展示：`ra.loan_coverage_ratio * 100`，保留 1 位小数
- 颜色规则反转：`< 30%` 绿、`30%–80%` 黄、`> 80%` 红
- 若 `loan_coverage_ratio === null` 显示 `—`

**风险清单**：
- "数据窗口不足" 以黄色 Alert banner 显示在风险清单上方（而非混在内嵌 risks 里）

### 7.2 `services/api.ts`

- `BankRatios` 类型：`loan_cover_ratio` → `loan_coverage_ratio`（保留旧字段 1 版本作 optional，避免旧报告 500）
- 新增 `AnnualOverview` 类型，插入 `BankDiagnosisReport` 顶层

---

## 8. 验收标准

1. ✅ 上传 ≥ 12 月流水：报告顶部 `AnnualOverviewCard` 显示"近 12 月年营业额 X"，段位正确分档
2. ✅ 上传 6 月流水：主位"近 6 月累计 Y"，副位"≈ 年化 Z"，风险上方黄色 banner "数据窗口不足，建议补传至 12 月"
3. ✅ 上传 18 月流水：主数字按近 12 月算，底部灰字显示全周期 18 月累计
4. ✅ `target_loan_amount=100`（万当元填）+ 年营业额 100 万 → `loan_coverage_ratio` 趋近 0，不按 low 处理，挂"金额单位核对"提示
5. ✅ `target_loan_amount=2_000_000`（200 万）+ 年营业额 600 万 → `loan_coverage_ratio = 0.33`，medium 级
6. ✅ `target_loan_amount=6_000_000`（600 万）+ 年营业额 600 万 → `loan_coverage_ratio = 1.0`，high 级
7. ✅ `annual_revenue_raw / annual_revenue` 差异在报告展开面板正确显示为"剔除率 X%"
8. ✅ 所有新增单测 + 既有 11 个单测全部通过

---

## 9. 兼容与回滚

- **旧诊断报告**：`risk_flags` JSON 里还包含 `loan_cover_ratio` 旧字段，前端增加 fallback 读取逻辑（`report.ratios.loan_coverage_ratio ?? report.ratios.loan_cover_ratio`）
- **回滚方案**：本次改动全部集中在 `bank_diagnosis.py` + 前端 `BankAnalysis.tsx` + `api.ts`，无数据库迁移。如需回滚，直接 `git revert` 即可，旧报告数据结构不受影响
- **部署顺序**：后端先部署（新字段可选）→ 前端再部署（读取新字段）

---

## 10. 与"三方数据打通"spec 的接口

本 spec 不处理三方打通的系统性问题，但以下 2 处做了**前向兼容**：

- `loan_coverage_ratio` 的分母 `annual_revenue` 口径已确定（业务性流入，元），**未来诊断引擎 `ScoringInput.target_amount` 对齐时直接用元为单位**，避免再出单位混乱
- `annual_overview.annual_revenue` 语义稳定，可作为未来「诊断报告引用流水数据」的唯一真相源（single source of truth）

---

## 11. 工作量估算

- 后端：~4h（含单测）
- 前端：~3h（新组件 + 类型调整）
- 联调 + 服务器部署验证：~1h
- **总计：~1 人日**
