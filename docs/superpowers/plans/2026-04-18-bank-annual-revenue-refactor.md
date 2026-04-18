# 流水分析「年营业额化」改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构流水分析报告为"年营业额优先"视角，同步修复 `loan_cover_ratio` 的语义反向问题（1123.9% bug）和单位误填陷阱。

**Architecture:** 后端以非破坏性方式在 `build_bank_diagnosis_report` 顶部挂一个新 `annual_overview` 块；`bank_diagnosis.py` 内把 `loan_cover_ratio` 改名为 `loan_coverage_ratio` 并反转语义（目标贷款/年营业额，lower_better）；前端顶部加 `AnnualOverviewCard`，原"贷款匹配度"卡片颜色规则反向。无数据库迁移。

**Tech Stack:** FastAPI + SQLAlchemy + pytest（后端），Vite + React 19 + TypeScript + Ant Design 5（前端），ECharts。

**Spec reference:** `docs/superpowers/specs/2026-04-18-bank-annual-revenue-refactor-design.md`

---

## File Structure

### 新建
- （无新文件）

### 修改
| 文件 | 职责 | 主要改动 |
|------|------|---------|
| `backend/services/analyzer.py` | 交易聚合器 | `monthly_summary` 条目扩展 `deduped_income` / `deduped_expense` |
| `backend/services/bank_diagnosis.py` | 诊断服务 | `THRESHOLDS` 扩展；新增 `compute_annual_overview`；`compute_ratios` 改名反转 `loan_coverage_ratio`；`build_risks_and_suggestions` 规则重写；`build_bank_diagnosis_report` 挂载新块 |
| `backend/tests/test_analyzer.py` | 分析器测试 | 补 1 个 deduped 字段测试 |
| `backend/tests/test_bank_diagnosis.py` | 诊断服务测试 | 补 7 个新用例（注意：spec §6.3 的 2 个阈值分级测试合并到同一测试函数） |
| `frontend/src/services/api.ts` | API/类型层 | 新增 `AnnualOverview` 类型；`BankRatios` 增 `loan_coverage_ratio`（主字段）+ `loan_cover_ratio`（可选，向后兼容） |
| `frontend/src/pages/BankAnalysis.tsx` | 流水分析页 | 顶部加 `AnnualOverviewCard`；原贷款覆盖卡文案+颜色反转；风险清单上方加"数据窗口不足"Alert banner |

---

## Task 1: 扩展 analyzer.monthly_summary，补 deduped_income/deduped_expense 字段

**Files:**
- Modify: `backend/services/analyzer.py:218-231`
- Modify: `backend/services/analyzer.py:268-289`（`_empty_result` 保持同构）
- Test: `backend/tests/test_analyzer.py`

**目的**：`compute_annual_overview` 需要在窗口截取后重新求和"业务性流入"。现在 `monthly_summary` 每条只有总 `income`/`expense`，没有去重后的值。

- [ ] **Step 1: 在 test_analyzer.py 末尾追加失败用例**

```python
# backend/tests/test_analyzer.py 追加
from services.analyzer import analyze_bank_statement


def test_monthly_summary_contains_deduped_fields():
    """monthly_summary 每条应携带 deduped_income / deduped_expense"""
    txns = [
        # 真实业务
        {"date": "2026-01-05", "counterparty": "客户A", "description": "货款",
         "income": 10000, "expense": 0, "balance": 10000},
        # 自转（对手方 = 持有人）
        {"date": "2026-01-06", "counterparty": "张三", "description": "自转",
         "income": 5000, "expense": 0, "balance": 15000},
        # 提现关键字（会被 mark_duplicates 剔除）
        {"date": "2026-01-08", "counterparty": "微信", "description": "微信提现",
         "income": 3000, "expense": 0, "balance": 18000},
    ]
    result = analyze_bank_statement(txns, "张三")
    m = result["monthly_summary"]
    assert len(m) == 1
    row = m[0]
    assert row["income"] == 18000          # 原始
    assert row["deduped_income"] == 10000  # 只留真实业务
    assert "deduped_expense" in row
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && python -m pytest tests/test_analyzer.py::test_monthly_summary_contains_deduped_fields -v
```
Expected: FAIL —— `KeyError: 'deduped_income'`

- [ ] **Step 3: 修改 analyze_bank_statement 的 monthly_summary 构造块**

`backend/services/analyzer.py` 当前 218–231 行完整替换为：

```python
    # --- Monthly summary ---
    monthly_summary = []
    for month in sorted(months):
        month_txns = [tx for tx in txns if tx["date"][:7] == month]
        month_non_dup = [tx for tx in month_txns if not tx.get("is_duplicate", False)]
        m_income = sum(tx.get("income", 0) for tx in month_txns)
        m_expense = sum(tx.get("expense", 0) for tx in month_txns)
        m_deduped_income = sum(tx.get("income", 0) for tx in month_non_dup)
        m_deduped_expense = sum(tx.get("expense", 0) for tx in month_non_dup)
        m_count = len(month_txns)
        monthly_summary.append({
            "month": month,
            "income": m_income,
            "expense": m_expense,
            "deduped_income": m_deduped_income,
            "deduped_expense": m_deduped_expense,
            "net": m_income - m_expense,
            "tx_count": m_count,
        })
```

关键变化：
- 新增 `month_non_dup` 行（按 `is_duplicate` 字段过滤）
- 每条 summary 增加两个字段 `deduped_income` / `deduped_expense`
- 原有 `income` / `expense` / `net` / `tx_count` 字段保持不变

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && python -m pytest tests/test_analyzer.py -v
```
Expected: 所有 analyzer 测试 PASS（新测试 PASS，原有不受影响）。

- [ ] **Step 5: 跑 bank_diagnosis 测试确认零回归**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v
```
Expected: 11 个既有测试全部 PASS。

- [ ] **Step 6: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/analyzer.py backend/tests/test_analyzer.py && git commit -m "feat(analyzer): add deduped_income/deduped_expense to monthly_summary

Prerequisite for compute_annual_overview which needs to re-sum the business-only
income after slicing to a 12-month window. Existing income/expense fields kept
unchanged for backward compatibility."
```

---

## Task 2: 更新 THRESHOLDS 配置

**Files:**
- Modify: `backend/services/bank_diagnosis.py:25-32`

**目的**：落 spec §5 的阈值表。新增 `loan_coverage` / `size_tier` / `window_adequacy`；`loan_ratio` 保留但标记 deprecated。

- [ ] **Step 1: 替换 THRESHOLDS 整块**

`backend/services/bank_diagnosis.py` 第 25–32 行改为：

```python
# ─── 阈值配置（业内常见取值，后续基于案例库校准）────────────────────
THRESHOLDS = {
    "coverage":  {"healthy": 2.0, "warn": 1.5},     # 月均流入 / 月均月供（higher_better）
    "balance":   {"healthy": 0.20, "warn": 0.10},   # 月均净流入 / 月均流入（higher_better）
    "volatility": {"healthy": 0.30, "warn": 0.50},  # std/mean（lower_better）
    "low_balance": {"healthy": 0.10, "warn": 0.05}, # 最低余额 / 月均流入（higher_better）

    # ── 新增：贷款覆盖率（反转后的语义：目标贷款 / 年营业额，lower_better）──
    "loan_coverage": {
        "healthy": 0.30,          # ≤30% 健康
        "warn":    0.80,          # 30–80% 警戒；>80% 高风险
        "unit_mismatch": 0.001,   # <0.1% 触发"金额单位核对"提示
    },

    # ── 新增：体量段位（按业务性年营业额，单位：元）──
    "size_tier": {
        "micro":  500_000,        # < 50 万
        "small":  5_000_000,      # 50 万 – 500 万
        "medium": 30_000_000,     # 500 万 – 3000 万
        "large":  100_000_000,    # 3000 万 – 1 亿
        # > 1 亿 = xlarge
    },

    # ── 新增：数据窗口不足提示（严格小于边界值时触发）──
    "window_adequacy": {
        "warn_below_months":   12,   # window < 12 → low 级（6–11 月）
        "severe_below_months":  6,   # window < 6  → 升级 medium
    },

    # ── Deprecated：旧字段，保留一个版本避免外部代码直接崩──
    # 新代码不要再读这个 key；下一次迭代删除
    "loan_ratio": {"healthy": 0.10, "warn": 0.05},
}
```

- [ ] **Step 2: 跑现有测试确认未破坏**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v
```
Expected: 11 测试 PASS（配置新增不影响任何既有行为）。

- [ ] **Step 3: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/bank_diagnosis.py && git commit -m "chore(bank-diagnosis): extend THRESHOLDS with loan_coverage/size_tier/window_adequacy

New keys support upcoming annual_overview + reversed loan_coverage_ratio logic.
Old loan_ratio key kept with deprecation marker for one release."
```

---

## Task 3: 实现 compute_annual_overview（核心函数，4 个场景）

**Files:**
- Modify: `backend/services/bank_diagnosis.py`（新增函数，建议插在 `compute_ratios` 之前，约第 117 行）
- Test: `backend/tests/test_bank_diagnosis.py`

**目的**：spec §3 要求的 `annual_overview` 块计算逻辑。处理 4 种窗口场景：= 12 月 / < 12 月（年化）/ > 12 月（截断 + 全周期副信息）/ 零流水。

- [ ] **Step 1: 追加 4 个失败用例**

在 `backend/tests/test_bank_diagnosis.py` 末尾追加：

```python
from services.bank_diagnosis import compute_annual_overview


def _mk_monthly_summary(n_months, income_per_month=1_500_000, start_year=2025, start_month=5):
    """生成连续 n 个月的 monthly_summary（deduped_income 与 income 相等，无自转）"""
    out = []
    y, m = start_year, start_month
    for _ in range(n_months):
        out.append({
            "month": f"{y:04d}-{m:02d}",
            "income": income_per_month,
            "expense": income_per_month * 0.8,
            "deduped_income": income_per_month,
            "deduped_expense": income_per_month * 0.8,
            "net": income_per_month * 0.2,
            "tx_count": 30,
        })
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def test_annual_overview_full_12_months():
    analysis = {"monthly_summary": _mk_monthly_summary(12, income_per_month=1_500_000)}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 12
    assert ov["annual_revenue"] == 18_000_000       # 1.5M × 12
    assert ov["monthly_avg_income"] == 1_500_000    # annual / 12
    assert ov["is_annualized"] is False
    assert ov["size_tier"] == "medium"              # 500万–3000万
    assert ov["full_window_months"] == 12


def test_annual_overview_partial_6_months():
    analysis = {"monthly_summary": _mk_monthly_summary(6, income_per_month=500_000)}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 6
    assert ov["annual_revenue"] == 3_000_000        # 实际 6 月累计
    assert ov["is_annualized"] is True
    assert ov["annualized_hint"] is not None        # "≈ 年化 ¥6,000,000（×2.0 估算）"
    assert "年化" in ov["annualized_hint"]


def test_annual_overview_over_12_months_truncates():
    analysis = {"monthly_summary": _mk_monthly_summary(18, income_per_month=1_000_000)}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 12                # 截断
    assert ov["annual_revenue"] == 12_000_000       # 最近 12 月
    assert ov["full_window_months"] == 18           # 全周期仍 = 18
    assert ov["full_window_revenue"] == 18_000_000
    assert ov["is_annualized"] is False


def test_annual_overview_zero():
    analysis = {"monthly_summary": []}
    ov = compute_annual_overview(analysis)
    assert ov["window_months"] == 0
    assert ov["annual_revenue"] == 0
    assert ov["size_tier"] == "micro"
    assert ov["is_annualized"] is False             # 零流水不算年化


def test_annual_overview_size_tier_boundaries():
    """验证段位分档阈值"""
    # micro: 10 万/年 → 10万 < 50万 = micro
    a1 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=8_333)}
    assert compute_annual_overview(a1)["size_tier"] == "micro"

    # small: 200 万/年（50-500 万）
    a2 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=166_667)}
    assert compute_annual_overview(a2)["size_tier"] == "small"

    # large: 5000 万/年（3000万-1亿）
    a3 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=4_166_667)}
    assert compute_annual_overview(a3)["size_tier"] == "large"

    # xlarge: 1.5 亿/年 (>1亿)
    a4 = {"monthly_summary": _mk_monthly_summary(12, income_per_month=12_500_000)}
    assert compute_annual_overview(a4)["size_tier"] == "xlarge"
```

- [ ] **Step 2: 跑测试确认全失败（函数不存在）**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v -k annual_overview
```
Expected: 5 个测试 FAIL，`ImportError: cannot import name 'compute_annual_overview'`

- [ ] **Step 3: 实现 compute_annual_overview**

在 `backend/services/bank_diagnosis.py` 的 `compute_ratios` 函数之前（约第 117 行，就是 `# ─── 三大比率 ───` 这个标题之前）插入：

```python
# ─── 年营业额总览 ────────────────────────────────────────────────

def _classify_size_tier(annual_revenue: float) -> tuple[str, str]:
    """根据业务性年营业额返回 (tier_code, tier_label)。"""
    t = THRESHOLDS["size_tier"]
    if annual_revenue < t["micro"]:
        return "micro", "微型（< 50 万）"
    if annual_revenue < t["small"]:
        return "small", "小型（50 万 – 500 万）"
    if annual_revenue < t["medium"]:
        return "medium", "中型（500 万 – 3000 万）"
    if annual_revenue < t["large"]:
        return "large", "大型（3000 万 – 1 亿）"
    return "xlarge", "特大型（> 1 亿）"


def compute_annual_overview(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    基于 analysis["monthly_summary"] 计算年营业额及体量段位。
    规则详见 spec §3、§6.1。

    返回字段：
      window_months / window_start / window_end
      annual_revenue / annual_revenue_raw / self_transfer_amount / self_transfer_ratio
      monthly_avg_income
      size_tier / size_tier_label
      is_annualized / annualized_hint
      full_window_months / full_window_revenue
    """
    monthly = analysis.get("monthly_summary") or []
    full_window_months = len(monthly)

    # 零流水 fast-path
    if full_window_months == 0:
        tier, label = _classify_size_tier(0)
        return {
            "window_months": 0,
            "window_start": None,
            "window_end": None,
            "annual_revenue": 0,
            "annual_revenue_raw": 0,
            "self_transfer_amount": 0,
            "self_transfer_ratio": 0.0,
            "monthly_avg_income": 0,
            "size_tier": tier,
            "size_tier_label": label,
            "is_annualized": False,
            "annualized_hint": None,
            "full_window_months": 0,
            "full_window_revenue": 0,
        }

    # 按 month 升序确保取"最近 N 条"
    sorted_monthly = sorted(monthly, key=lambda m: m.get("month", ""))

    # 取最近 min(12, len) 作为计算窗口
    window_n = min(12, full_window_months)
    window = sorted_monthly[-window_n:]

    def _safe_sum(key, rows):
        return sum(float(r.get(key) or 0) for r in rows)

    annual_revenue = _safe_sum("deduped_income", window)
    annual_revenue_raw = _safe_sum("income", window)
    # 防御：analyzer 若未携带 deduped_income，退回 income（应不会出现，留个兜底）
    if annual_revenue == 0 and annual_revenue_raw > 0 and not any("deduped_income" in r for r in window):
        annual_revenue = annual_revenue_raw

    self_transfer_amount = max(0, annual_revenue_raw - annual_revenue)
    self_transfer_ratio = (
        round(self_transfer_amount / annual_revenue_raw, 3)
        if annual_revenue_raw > 0 else 0.0
    )

    # 月均：窗口 ≥12 月按 /12，不足按 /window_n
    monthly_avg_income = annual_revenue / (12 if window_n >= 12 else window_n)

    is_annualized = window_n < 12
    annualized_hint = None
    if is_annualized and window_n > 0:
        annualized = annual_revenue * 12 / window_n
        annualized_hint = f"≈ 年化 ¥{annualized:,.0f}（×{12/window_n:.1f} 估算）"

    tier, label = _classify_size_tier(annual_revenue)

    full_window_revenue = _safe_sum("deduped_income", sorted_monthly)

    return {
        "window_months": window_n,
        "window_start": window[0]["month"],
        "window_end": window[-1]["month"],
        "annual_revenue": round(annual_revenue, 2),
        "annual_revenue_raw": round(annual_revenue_raw, 2),
        "self_transfer_amount": round(self_transfer_amount, 2),
        "self_transfer_ratio": self_transfer_ratio,
        "monthly_avg_income": round(monthly_avg_income, 2),
        "size_tier": tier,
        "size_tier_label": label,
        "is_annualized": is_annualized,
        "annualized_hint": annualized_hint,
        "full_window_months": full_window_months,
        "full_window_revenue": round(full_window_revenue, 2),
    }
```

- [ ] **Step 4: 跑测试确认全部通过**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v -k annual_overview
```
Expected: 5 个测试 PASS。

- [ ] **Step 5: 跑全量测试零回归**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/bank_diagnosis.py backend/tests/test_bank_diagnosis.py && git commit -m "feat(bank-diagnosis): add compute_annual_overview for yearly revenue framing

Computes near-12-month annual revenue (business-only), size tier, and
annualization hint from analyzer monthly_summary. Handles 4 window
scenarios: exactly 12 months, partial (<12), over 12 (truncate + full
period side info), zero flow."
```

---

## Task 4: `loan_coverage_ratio` 语义反转（改名 + 反向阈值）

**Files:**
- Modify: `backend/services/bank_diagnosis.py::compute_ratios` (现约 119–158 行)
- Modify: `backend/services/bank_diagnosis.py::build_risks_and_suggestions` (现约 246–263 行的"目标贷款匹配"规则)
- Test: `backend/tests/test_bank_diagnosis.py`

**目的**：新公式 `loan_coverage_ratio = target_loan / annual_revenue`，`lower_better`，阈值 `healthy=0.30 / warn=0.80`。

- [ ] **Step 1: 追加失败测试**

```python
# backend/tests/test_bank_diagnosis.py 追加
def test_loan_coverage_semantic_reversal():
    """新公式 loan_coverage_ratio = 目标贷款 / 年营业额（lower_better）"""
    from services.bank_diagnosis import compute_ratios
    # 年营业额 200 万 通过 monthly_summary 传递（12 月 × 月均 16.67 万）
    analysis = _mk_analysis(monthly_incomes=[166667] * 12)  # ≈ 200 万/年
    # 贷款 60 万 → 30% ≈ healthy
    ctx = _mk_ctx(target_loan_amount=600_000)
    r = compute_ratios(analysis, ctx)
    assert r["loan_coverage_ratio"] is not None
    assert abs(r["loan_coverage_ratio"] - 0.30) < 0.01

    # 贷款 170 万 → 85% = high
    ctx2 = _mk_ctx(target_loan_amount=1_700_000)
    r2 = compute_ratios(analysis, ctx2)
    assert r2["loan_coverage_ratio"] > 0.80


def test_loan_coverage_level_rules():
    """确认规则引擎对 loan_coverage_ratio 用 lower_better 分级"""
    from services.bank_diagnosis import build_risks_and_suggestions
    # ratio=0.85 → high
    ratios = {"coverage_ratio": None, "balance_ratio": None,
              "volatility_coef": None, "low_balance_ratio": None,
              "loan_coverage_ratio": 0.85}
    out = build_risks_and_suggestions(ratios, {"top_income_sources": []})
    cov_risks = [r for r in out["risks"] if r["category"] == "贷款覆盖率"]
    assert len(cov_risks) == 1
    assert cov_risks[0]["level"] == "high"

    # ratio=0.25 → 无风险
    ratios2 = {**ratios, "loan_coverage_ratio": 0.25}
    out2 = build_risks_and_suggestions(ratios2, {"top_income_sources": []})
    assert not any(r["category"] == "贷款覆盖率" for r in out2["risks"])
```

_注：现有 `_mk_analysis` helper 使用 `deduped_monthly_avg_income` 字段，不驱动 `annual_revenue`。`loan_coverage_ratio` 的分母在 `compute_ratios` 里临时改为直接从 `deduped_monthly_avg_income × 12` 推导（与 annual_overview 对齐但不依赖），以保证既有测试 helper 无需变更。_

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py::test_loan_coverage_semantic_reversal tests/test_bank_diagnosis.py::test_loan_coverage_level_rules -v
```
Expected: 2 个测试 FAIL（字段不存在或规则未更新）。

- [ ] **Step 3: 修改 compute_ratios**

在 `backend/services/bank_diagnosis.py::compute_ratios` 里：

1. 删除原有 `loan_cover_ratio` 行（在 `ratios` 字典里）
2. 把原来的 "month_avg_income / target_loan" 那段改成：

```python
    # ── 新：贷款覆盖率（反转后：目标贷款 / 年营业额，lower_better）──
    # 年营业额 ≈ monthly_avg_income × 12（对齐 annual_overview 口径）
    if context and context.target_loan_amount and context.target_loan_amount > 0:
        annual_rev = monthly_avg_income * 12
        if annual_rev > 0:
            ratios["loan_coverage_ratio"] = round(
                context.target_loan_amount / annual_rev, 4
            )
        else:
            ratios["loan_coverage_ratio"] = None
    else:
        ratios["loan_coverage_ratio"] = None
```

同时把 `ratios` 初始化字典里的 `"loan_cover_ratio": None` 改为 `"loan_coverage_ratio": None`。

完整修改后 `compute_ratios` 的返回字典字段为：

```python
ratios: Dict[str, Any] = {
    "coverage_ratio": None,
    "balance_ratio": None,
    "volatility_coef": None,
    "low_balance_ratio": None,
    "loan_coverage_ratio": None,  # 原 loan_cover_ratio
}
```

- [ ] **Step 4: 修改 build_risks_and_suggestions 的第 4 条规则**

在 `backend/services/bank_diagnosis.py::build_risks_and_suggestions` 里，定位到原"月均流水 / 目标贷款金额（银行 10 倍原则）"那块（约 246–263 行），**完整替换**为：

```python
    # ── 4. 贷款覆盖率（目标贷款 / 年营业额）─────────────────
    lc = ratios.get("loan_coverage_ratio")
    if lc is not None:
        lvl = _level_for(lc, THRESHOLDS["loan_coverage"], "lower_better")
        if lvl != "low":
            risks.append({
                "level": lvl,
                "category": "贷款覆盖率",
                "title": f"目标贷款占年营业额 {lc*100:.1f}%"
                         f"（{'警戒' if lvl == 'medium' else '高风险'}）",
                "detail": f"银行标准：目标贷款应 ≤ 年营业额的 "
                          f"{int(THRESHOLDS['loan_coverage']['healthy']*100)}%。"
                          f"当前占比偏高，{'需抵押或强担保加持' if lvl == 'medium' else '大概率过不了初审'}",
            })
            suggestions.append({
                "category": "调整申贷策略",
                "action": "① 降低目标贷款额；② 合并其他账户流水做大年营业额基数；"
                          "③ 3-6 个月内做大业务性入账后再申",
                "priority": "high" if lvl == "high" else "medium",
            })
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v
```
Expected: 新测试 PASS，同时确认所有原测试依然 PASS（注意：原 `test_rules_low_coverage_yields_high_risk` 和 `test_rules_sorted_high_first` 仍应通过，因为它们测的是 coverage_ratio 不是 loan_coverage_ratio；原 `test_rules_healthy_produces_no_risk` 里用的 `loan_cover_ratio` 字段已不存在，需修改）。

如果 `test_rules_healthy_produces_no_risk` 失败，修改该测试：

```python
def test_rules_healthy_produces_no_risk():
    ratios = {
        "coverage_ratio": 3.0,
        "balance_ratio": 0.3,
        "volatility_coef": 0.1,
        "low_balance_ratio": 0.2,
        "loan_coverage_ratio": 0.15,   # 原来是 "loan_cover_ratio": 0.15
    }
    ...
```

同理修改 `test_rules_sorted_high_first`：把 `"loan_cover_ratio": 0.08` 改为 `"loan_coverage_ratio": 0.85`（新公式下 0.85 = high）。

- [ ] **Step 6: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/bank_diagnosis.py backend/tests/test_bank_diagnosis.py && git commit -m "feat(bank-diagnosis): reverse loan_coverage_ratio semantics (target/annual, lower_better)

Matches bankers' actual 10x-rule phrasing: loan should be ≤30% of annual
revenue (healthy) / ≤80% (warn). Fixes the 1123.9% display bug by bounding
the ratio in 0–1+ range. New field name loan_coverage_ratio replaces
loan_cover_ratio. Old field removed from output (frontend has fallback)."
```

---

## Task 5: 金额单位误填提示（unit_mismatch）

**Files:**
- Modify: `backend/services/bank_diagnosis.py::build_risks_and_suggestions`
- Test: `backend/tests/test_bank_diagnosis.py`

**目的**：spec §4.3 要求：当 `loan_coverage_ratio < 0.001`（贷款 < 年营业额的 0.1%）时，额外挂一条 `low` 级"金额异常"提示。

- [ ] **Step 1: 追加失败测试**

```python
def test_loan_coverage_unit_mismatch_hint():
    """贷款 100 元 vs 年营业额 100 万 → 额外"金额异常"提示"""
    from services.bank_diagnosis import build_risks_and_suggestions
    ratios = {
        "coverage_ratio": None, "balance_ratio": None,
        "volatility_coef": None, "low_balance_ratio": None,
        "loan_coverage_ratio": 0.0001,  # 100元 / 100万 = 0.0001
    }
    out = build_risks_and_suggestions(ratios, {"top_income_sources": []})
    unit_hints = [r for r in out["risks"] if r["category"] == "金额异常"]
    assert len(unit_hints) == 1
    assert unit_hints[0]["level"] == "low"
    assert "核对" in unit_hints[0]["detail"] or "单位" in unit_hints[0]["detail"]
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py::test_loan_coverage_unit_mismatch_hint -v
```
Expected: FAIL（没有"金额异常"分类的风险）。

- [ ] **Step 3: 在 build_risks_and_suggestions 第 4 条规则后追加**

紧接着上一步加的 `# ── 4. 贷款覆盖率` 整块之后，插入：

```python
    # ── 4b. 特殊异常：金额单位误填（loan_coverage 过小）──
    if lc is not None and lc < THRESHOLDS["loan_coverage"]["unit_mismatch"]:
        risks.append({
            "level": "low",
            "category": "金额异常",
            "title": "目标贷款金额相对年营业额过小（< 0.1%）",
            "detail": "请核对「目标贷款金额」字段的单位是否为元。"
                      "常见错误：把「100 万」填成了「100」。",
        })
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/bank_diagnosis.py backend/tests/test_bank_diagnosis.py && git commit -m "feat(bank-diagnosis): detect target_loan_amount unit-mismatch input

When loan_coverage_ratio drops below 0.1% the user likely filled 万 amount
as 元 (e.g. '100' instead of '1000000'). Emit a low-level hint without
overriding the standard classification."
```

---

## Task 6: 数据窗口不足规则（window adequacy）

**Files:**
- Modify: `backend/services/bank_diagnosis.py::build_bank_diagnosis_report`（需要把 `annual_overview` 的 `window_months` 传给规则引擎）或 `build_risks_and_suggestions` 增加一个参数
- Modify: `backend/services/bank_diagnosis.py::build_risks_and_suggestions`
- Test: `backend/tests/test_bank_diagnosis.py`

**目的**：spec §5：< 6 月 → medium、6–11 月 → low、≥ 12 → 不提示。本条规则需要 `window_months`，不属于 ratios，所以通过参数注入。

- [ ] **Step 1: 追加失败测试**

```python
def test_window_adequacy_warnings():
    """window_months < 6 → medium；6–11 → low；>=12 → 无"""
    from services.bank_diagnosis import build_risks_and_suggestions
    all_none_ratios = {k: None for k in
                       ("coverage_ratio", "balance_ratio", "volatility_coef",
                        "low_balance_ratio", "loan_coverage_ratio")}

    # window=3 → medium
    out = build_risks_and_suggestions(all_none_ratios, {"top_income_sources": []},
                                       window_months=3)
    w_risks = [r for r in out["risks"] if r["category"] == "数据窗口"]
    assert len(w_risks) == 1 and w_risks[0]["level"] == "medium"

    # window=8 → low
    out2 = build_risks_and_suggestions(all_none_ratios, {"top_income_sources": []},
                                        window_months=8)
    w2 = [r for r in out2["risks"] if r["category"] == "数据窗口"]
    assert len(w2) == 1 and w2[0]["level"] == "low"

    # window=12 → 无
    out3 = build_risks_and_suggestions(all_none_ratios, {"top_income_sources": []},
                                        window_months=12)
    assert not any(r["category"] == "数据窗口" for r in out3["risks"])
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py::test_window_adequacy_warnings -v
```
Expected: FAIL（signature mismatch 或无该规则）。

- [ ] **Step 3: 修改 build_risks_and_suggestions 函数签名 + 增加规则**

函数签名改为（加默认参数保持 BC）：

```python
def build_risks_and_suggestions(
    ratios: Dict[str, Any],
    analysis: Dict[str, Any],
    window_months: Optional[int] = None,
) -> Dict[str, List[dict]]:
```

在函数体的 "# ── 6. 对手方高度集中" 那条规则**之后**、在 "# 排序" 之前，插入：

```python
    # ── 7. 数据窗口不足（依赖 annual_overview，通过参数传入）──
    if window_months is not None:
        wa = THRESHOLDS["window_adequacy"]
        if window_months < wa["severe_below_months"]:
            risks.append({
                "level": "medium",
                "category": "数据窗口",
                "title": f"数据窗口仅 {window_months} 月，严重不足",
                "detail": f"银行审阅通常要求近 12 月完整流水。"
                          f"当前数据 < {wa['severe_below_months']} 月，"
                          f"建议尽快补充，否则分析结果参考价值有限。",
            })
        elif window_months < wa["warn_below_months"]:
            risks.append({
                "level": "low",
                "category": "数据窗口",
                "title": f"数据窗口 {window_months} 月，建议补齐",
                "detail": f"当前数据 < 12 月，部分指标基于近 {window_months} 月年化估算。"
                          f"补齐至 12 月可提高分析精度。",
            })
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py -v
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/bank_diagnosis.py backend/tests/test_bank_diagnosis.py && git commit -m "feat(bank-diagnosis): add data-window-adequacy risk rule

Flags <6 months as medium and 6-11 months as low. Signal is passed in
from the caller (build_bank_diagnosis_report) to keep build_risks_and_
suggestions a pure function over ratios + analysis."
```

---

## Task 7: 在 build_bank_diagnosis_report 挂载 annual_overview + 联动 window_months

**Files:**
- Modify: `backend/services/bank_diagnosis.py::build_bank_diagnosis_report`（现约 305–352 行）
- Test: `backend/tests/test_bank_diagnosis.py`（扩展 smoke 测试）

**目的**：最终把 `annual_overview` 挂进报告 JSON 顶部，并把其 `window_months` 传给 `build_risks_and_suggestions`。

- [ ] **Step 1: 追加失败测试**

```python
def test_build_report_includes_annual_overview():
    """端到端：build_bank_diagnosis_report 返回顶部含 annual_overview"""
    client = SimpleNamespace(id=1, name="李四", company_name="李四商贸")
    ctx = _mk_ctx(target_loan_amount=600_000)

    # 构造 12 月流水（每月 20 万真实业务入账）
    raw = []
    for m in range(1, 13):
        raw.append({
            "date": f"2025-{m:02d}-05",
            "counterparty": "客户A", "description": "货款",
            "income": 200_000, "expense": 0, "balance": 200_000 * m,
        })
    s1 = SimpleNamespace(raw_data=raw, bank_name="工行")

    report = build_bank_diagnosis_report(client, [s1], ctx)
    assert "annual_overview" in report
    ov = report["annual_overview"]
    assert ov["window_months"] == 12
    assert ov["annual_revenue"] == 2_400_000        # 20万 × 12
    assert ov["size_tier"] == "small"               # 50万-500万
    # loan_coverage_ratio = 60万 / 240万 = 0.25 → healthy
    assert report["ratios"]["loan_coverage_ratio"] is not None
    assert abs(report["ratios"]["loan_coverage_ratio"] - 0.25) < 0.01
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && python -m pytest tests/test_bank_diagnosis.py::test_build_report_includes_annual_overview -v
```
Expected: FAIL（`annual_overview` 键不存在）。

- [ ] **Step 3: 修改 build_bank_diagnosis_report**

`backend/services/bank_diagnosis.py::build_bank_diagnosis_report` 整体修改如下——在计算 `ratios` 之后、调用 `build_risks_and_suggestions` 之前插入 `annual_overview` 计算，并把 `window_months` 传给规则引擎：

```python
def build_bank_diagnosis_report(
    client: Client,
    statements: List[BankStatement],
    context: Optional[BankAnalysisContext],
) -> Dict[str, Any]:
    from datetime import datetime

    analysis = merge_client_transactions(client, statements, context)
    annual = compute_annual_overview(analysis)                # 新增
    ratios = compute_ratios(analysis, context)
    rs = build_risks_and_suggestions(
        ratios, analysis,
        window_months=annual["window_months"],                # 新增
    )

    high = sum(1 for r in rs["risks"] if r["level"] == "high")
    medium = sum(1 for r in rs["risks"] if r["level"] == "medium")
    low = sum(1 for r in rs["risks"] if r["level"] == "low")

    return {
        "client_name": client.name,
        "client_company": client.company_name,
        "generated_at": datetime.utcnow().isoformat(),
        "account_count": analysis.get("account_count", 0),
        "banks": analysis.get("banks", []),
        "annual_overview": annual,                            # 新增
        "context": {
            "target_loan_amount": context.target_loan_amount if context else None,
            "existing_monthly_payment": context.existing_monthly_payment if context else None,
        },
        "overview": {
            "monthly_avg_income": analysis.get("deduped_monthly_avg_income", 0),
            "monthly_avg_expense": analysis.get("deduped_monthly_avg_expense", 0),
            "monthly_avg_net": (
                float(analysis.get("deduped_monthly_avg_income") or 0)
                - float(analysis.get("deduped_monthly_avg_expense") or 0)
            ),
            "total_income": analysis.get("deduped_total_income", 0),
            "total_expense": analysis.get("deduped_total_expense", 0),
            "min_balance": analysis.get("min_balance", 0),
            "avg_balance": analysis.get("avg_balance", 0),
            "monthly_avg_tx_count": analysis.get("monthly_avg_tx_count", 0),
        },
        "ratios": ratios,
        "thresholds": THRESHOLDS,
        "monthly_summary": analysis.get("monthly_summary", []),
        "top_income_sources": analysis.get("top_income_sources", []),
        "top_expense_categories": analysis.get("top_expense_categories", []),
        "monthly_ending_balances": analysis.get("monthly_ending_balances", []),
        "risks": rs["risks"],
        "suggestions": rs["suggestions"],
        "risk_summary": {"high": high, "medium": medium, "low": low},
    }
```

- [ ] **Step 4: 跑全量测试确认通过**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: 全 PASS（含既有的 `test_build_report_smoke` 自动享受新字段）。

- [ ] **Step 5: 语法自检**

```bash
cd backend && python -c "from services.bank_diagnosis import build_bank_diagnosis_report, compute_annual_overview, compute_ratios, THRESHOLDS; print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add backend/services/bank_diagnosis.py backend/tests/test_bank_diagnosis.py && git commit -m "feat(bank-diagnosis): mount annual_overview in report + wire window_months to rules

Final integration: report JSON now has annual_overview at top level, and
the window-adequacy rule is driven by annual_overview.window_months.
End-to-end test asserts new field flow."
```

---

## Task 8: 前端类型更新（api.ts）

**Files:**
- Modify: `frontend/src/services/api.ts:334-384`

**目的**：spec §7.2。新增 `AnnualOverview` 类型；`BankRatios` 加 `loan_coverage_ratio` 主字段 + 保留 `loan_cover_ratio` 可选作向后兼容。

- [ ] **Step 1: 修改 BankRatios 接口（第 334–340 行附近）**

```typescript
export interface BankRatios {
  coverage_ratio: number | null;
  balance_ratio: number | null;
  volatility_coef: number | null;
  low_balance_ratio: number | null;
  loan_coverage_ratio: number | null;     // 主字段（新）
  loan_cover_ratio?: number | null;       // 旧字段兼容，只在读取旧报告时用
}
```

- [ ] **Step 2: 在 BankRatios 之后插入 AnnualOverview 接口**

```typescript
export interface AnnualOverview {
  window_months: number;
  window_start: string | null;
  window_end: string | null;
  annual_revenue: number;
  annual_revenue_raw: number;
  self_transfer_amount: number;
  self_transfer_ratio: number;
  monthly_avg_income: number;
  size_tier: 'micro' | 'small' | 'medium' | 'large' | 'xlarge';
  size_tier_label: string;
  is_annualized: boolean;
  annualized_hint: string | null;
  full_window_months: number;
  full_window_revenue: number;
}
```

- [ ] **Step 3: 修改 BankDiagnosisReport 接口（第 355–384 行）**

在 `ratios: BankRatios;` 之前加一行：

```typescript
  annual_overview?: AnnualOverview;   // 老报告可能没有，给 optional
```

- [ ] **Step 4: TypeScript 编译检查**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无错误（若有 `loan_cover_ratio` 旧引用编译出错，下一个任务会修）。

_注：编译可能报 `BankAnalysis.tsx` 里读 `loan_cover_ratio` 的地方类型不匹配，属预期——会在 Task 10 处理。_

- [ ] **Step 5: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add frontend/src/services/api.ts && git commit -m "feat(api): add AnnualOverview type + loan_coverage_ratio field

Old loan_cover_ratio kept as optional for backward-compat when reading
historical reports. New reports always carry loan_coverage_ratio."
```

---

## Task 9: 新增 AnnualOverviewCard 组件

**Files:**
- Modify: `frontend/src/pages/BankAnalysis.tsx`（在文件上部、`DiagnosisReportTab` 函数之前新增组件；在报告渲染处挂载）

**目的**：spec §7.1 定义的顶部卡片。

- [ ] **Step 1: 确认当前 DiagnosisReportTab 结构**

```bash
cd frontend && grep -n "DiagnosisReportTab\|function.*Tab\|export.*BankAnalysis" src/pages/BankAnalysis.tsx | head -30
```

从输出定位 `DiagnosisReportTab` 起始行（约第 250 行上下）和 `<Row gutter=` 第一次出现的位置（现有比率卡组）。

- [ ] **Step 2: 在 BankAnalysis.tsx 的 imports 之后、首个组件之前，插入 AnnualOverviewCard 组件**

找到 `import` 块末尾（约第 30 行之前），之后、第一个组件定义之前，插入：

```tsx
import { Descriptions, Collapse } from 'antd';     // 若已有则合并到现有 import
import type { AnnualOverview } from '../services/api';

function AnnualOverviewCard({ data }: { data: AnnualOverview }) {
  if (!data || data.window_months === 0) {
    return (
      <Card style={{ borderRadius: 12, marginBottom: 24, background: '#FAFAFA' }}>
        <div style={{ padding: 16, color: '#8C8C8C' }}>暂无流水数据，无法计算年营业额。</div>
      </Card>
    );
  }

  const money = (v: number) => `¥ ${v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
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
            {money(data.annual_revenue)}
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
        月均进账：{money(data.monthly_avg_income)}
        {hasFullExtra && (
          <span>&nbsp;·&nbsp;全周期 {data.full_window_months} 月累计：{money(data.full_window_revenue)}</span>
        )}
      </div>

      <Collapse ghost size="small" style={{ marginTop: 8 }}
                items={[{
                  key: 'detail',
                  label: '展开：账面 vs 业务性 vs 剔除率',
                  children: (
                    <Descriptions size="small" column={{ xs: 1, sm: 3 }} bordered={false}>
                      <Descriptions.Item label="账面累计">{money(data.annual_revenue_raw)}</Descriptions.Item>
                      <Descriptions.Item label="业务性累计">{money(data.annual_revenue)}</Descriptions.Item>
                      <Descriptions.Item label="自转/提现剔除">
                        {money(data.self_transfer_amount)}（{(data.self_transfer_ratio * 100).toFixed(1)}%）
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                }]} />
    </Card>
  );
}
```

- [ ] **Step 3: 在 DiagnosisReportTab 渲染中挂载**

找到 DiagnosisReportTab 里第一个主内容 `<Row>`（比率卡那组）**之前**，插入：

```tsx
      {report.annual_overview && <AnnualOverviewCard data={report.annual_overview} />}
```

- [ ] **Step 4: TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 5: 本地启动跑一下页面（可跳过，见 Task 13 统一联调）**

```bash
cd frontend && npm run dev
# 浏览器访问，选已有有流水的客户 → 诊断报告 → 顶部应见新卡片
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add frontend/src/pages/BankAnalysis.tsx && git commit -m "feat(bank-ui): add AnnualOverviewCard to diagnosis report

Primary number = business-only annual revenue (near-12-month window) with
size tier badge. Collapsible detail shows raw/business/self-transfer
breakdown. Partial-window case displays 'annualized' side hint in orange."
```

---

## Task 10: 更新贷款覆盖率卡片文案 + 颜色规则反转

**Files:**
- Modify: `frontend/src/pages/BankAnalysis.tsx:335-347`

**目的**：spec §4.4 UI 文案变化；spec §7.1 颜色规则反向。

- [ ] **Step 1: 定位现有卡片**

`frontend/src/pages/BankAnalysis.tsx` 第 335–347 行左右的"贷款匹配度"卡片：

```tsx
<Col xs={12} sm={8} md={6}>
  <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
    <Statistic
      title={<Tooltip title="月均流水 / 目标贷款金额，银行 10 倍原则，应 ≥ 10%">贷款匹配度</Tooltip>}
      value={ra.loan_cover_ratio !== null ? ra.loan_cover_ratio * 100 : '—'}
      suffix={ra.loan_cover_ratio !== null ? '%' : ''}
      precision={ra.loan_cover_ratio !== null ? 1 : undefined}
      valueStyle={{
        color: ratioColor(ra.loan_cover_ratio, T.loan_ratio?.healthy ?? 0.1, T.loan_ratio?.warn ?? 0.05),
      }}
    />
  </Card>
</Col>
```

- [ ] **Step 2: 完整替换为新版**

```tsx
<Col xs={12} sm={8} md={6}>
  <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
    <Statistic
      title={<Tooltip title="目标贷款 / 年营业额，银行标准应 ≤ 30%（越小越稳）">贷款覆盖率</Tooltip>}
      value={
        (ra.loan_coverage_ratio ?? ra.loan_cover_ratio) !== null &&
        (ra.loan_coverage_ratio ?? ra.loan_cover_ratio) !== undefined
          ? (ra.loan_coverage_ratio ?? ra.loan_cover_ratio)! * 100
          : '—'
      }
      suffix={
        (ra.loan_coverage_ratio ?? ra.loan_cover_ratio) !== null &&
        (ra.loan_coverage_ratio ?? ra.loan_cover_ratio) !== undefined
          ? '%' : ''
      }
      precision={
        (ra.loan_coverage_ratio ?? ra.loan_cover_ratio) !== null &&
        (ra.loan_coverage_ratio ?? ra.loan_cover_ratio) !== undefined
          ? 1 : undefined
      }
      valueStyle={{
        color: ratioColor(
          ra.loan_coverage_ratio ?? ra.loan_cover_ratio ?? null,
          T.loan_coverage?.healthy ?? 0.30,
          T.loan_coverage?.warn ?? 0.80,
          false,  // lower_better：越小越健康
        ),
      }}
    />
  </Card>
</Col>
```

注：第 4 个参数 `false` 传给 `ratioColor` 表示 `lower_better`——请确认 `ratioColor` 函数签名支持该参数。若不支持需先扩展该 helper（通常在同文件上部）。

- [ ] **Step 3: 若 ratioColor 不支持 lower_better，扩展之**

```bash
cd frontend && grep -n "function ratioColor\|const ratioColor" src/pages/BankAnalysis.tsx
```

如果函数签名目前是 `(value, healthy, warn)` 三参，需要增加第 4 个参数。找到原函数并替换为：

```tsx
function ratioColor(
  value: number | null | undefined,
  healthy: number,
  warn: number,
  higherBetter: boolean = true,
): string {
  if (value === null || value === undefined) return '#8C8C8C';
  if (higherBetter) {
    if (value >= healthy) return '#36B37E';
    if (value >= warn)    return '#FAAD14';
    return '#FF5630';
  } else {
    if (value <= healthy) return '#36B37E';
    if (value <= warn)    return '#FAAD14';
    return '#FF5630';
  }
}
```

_（如果原函数已经支持这个第 4 参——比如波动系数那张卡就是 `lower_better`——那就不用改了；确认一下即可。）_

- [ ] **Step 4: TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add frontend/src/pages/BankAnalysis.tsx && git commit -m "feat(bank-ui): rewrite loan-coverage card with reversed semantics

Title: 贷款匹配度 → 贷款覆盖率. Tooltip cites '≤30% 健康'. Color is
lower-better (越小越绿). Reads new loan_coverage_ratio with fallback to
loan_cover_ratio for old report cache."
```

---

## Task 11: 风险上方 Alert banner（数据窗口不足 + 金额异常）

**Files:**
- Modify: `frontend/src/pages/BankAnalysis.tsx`（风险清单区域）

**目的**：spec §7.1 "数据窗口不足提示以黄色 Alert banner 显示在风险清单上方"。顺便把新增的"金额异常"也 banner 化（两个都是需要立刻引起注意的配置型提示）。

- [ ] **Step 1: 定位风险清单区域**

```bash
cd frontend && grep -n "风险预警\|report.risks\|risk_summary" src/pages/BankAnalysis.tsx | head -10
```

找到风险清单 Card 的起始位置（约 376 行附近 `{/* ── 风险预警 ── */}`）。

- [ ] **Step 2: 在风险清单 Card 之前插入 banner**

```tsx
{/* ── 顶部配置型提示 banner（窗口不足 / 金额异常）── */}
{(() => {
  const bannerRisks = (report.risks || []).filter(
    (r) => r.category === '数据窗口' || r.category === '金额异常',
  );
  if (bannerRisks.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      {bannerRisks.map((r, i) => (
        <Alert
          key={i}
          type={r.level === 'medium' ? 'warning' : 'info'}
          showIcon
          message={r.title}
          description={r.detail}
          style={{ marginBottom: 8, borderRadius: 8 }}
        />
      ))}
    </div>
  );
})()}
```

确认文件顶部 `antd` 的 import 含 `Alert`，没有则加上。

- [ ] **Step 3: 在风险清单渲染处排除上面已 banner 化的两类**

找到风险清单 `.map` 那段（通常形如 `report.risks.map(...)`），改为：

```tsx
{(report.risks || [])
  .filter((r) => r.category !== '数据窗口' && r.category !== '金额异常')
  .map((r, i) => (
    // 既有渲染逻辑
  ))
}
```

- [ ] **Step 4: TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git add frontend/src/pages/BankAnalysis.tsx && git commit -m "feat(bank-ui): surface '数据窗口' and '金额异常' as top banners

Configuration-type risks should not mix with business risks in the list.
Medium data-window gets yellow warning; low-level hints get info blue."
```

---

## Task 12: 后端前端联调 + 服务器部署 + 真实数据验收

**Files:**
- （仅验证，无代码改动）

**目的**：spec §8 所有验收点在服务器环境跑一遍。

- [ ] **Step 1: 本地跑全量后端测试**

```bash
cd backend && python -m pytest tests/ -v --tb=short
```
Expected: 所有测试 PASS（原 11 个 + 新增 9 个 = 20 个 bank_diagnosis 测试 + 原 analyzer 测试 + 新增 1 个 analyzer 测试）。

- [ ] **Step 2: 本地前端构建**

```bash
cd frontend && npm run build
```
Expected: `dist/` 生成成功，无 TS 错误。

- [ ] **Step 3: 推到远端**

```bash
cd "/Users/renhai2025/Desktop/云上融项目开发" && git push origin main
```

- [ ] **Step 4: 服务器拉取 + 部署后端**

（参考 CLAUDE.md 项目的部署模式；如不清楚请用项目实际部署流程）

```bash
ssh <server> "cd /opt/qiyefuwu && for i in 1 2 3 4 5; do git pull && break || sleep 10; done && systemctl restart qiyefuwu"
```

- [ ] **Step 5: 服务器验证后端健康**

```bash
curl -s https://<domain>/api/health | head
```
Expected: 200 响应。

- [ ] **Step 6: 服务器拉 + 发前端**

```bash
ssh <server> "cd /opt/qiyefuwu/frontend && npm ci && npm run build && rsync -a dist/ /var/www/qiyefuwu/"
```
（或按项目实际发布方式）

- [ ] **Step 7: 浏览器 e2e 验收 8 条（spec §8）**

在生产环境操作，逐条打勾：
- [ ] 7.1 一个已上传 ≥ 12 月流水的客户：报告顶部显示 `AnnualOverviewCard`，段位分档正确
- [ ] 7.2 找一个 < 12 月流水的客户（或手动构造）：主位"近 N 月累计" + 副位"≈ 年化" + 顶部 warning banner
- [ ] 7.3 一个 > 12 月的客户：主数字为近 12 月，副行显示全周期累计
- [ ] 7.4 把某客户的 target_loan_amount 改为 100 元（模拟单位误填）：报告顶部 info banner 提示"金额单位"
- [ ] 7.5 target=200万、年营业额=600万：贷款覆盖率显示 33%，黄色
- [ ] 7.6 target=600万、年营业额=600万：贷款覆盖率显示 100%，红色
- [ ] 7.7 展开卡片"详情"：账面/业务性/剔除率 三值显示正确
- [ ] 7.8 服务器 pytest：`cd /opt/qiyefuwu/backend && python -m pytest tests/ -v` 全 PASS

- [ ] **Step 8: 如有 bug，回到对应 Task 修复；否则关闭本 plan**

- [ ] **Step 9: Final commit（若无新代码则跳过）**

```bash
# 若 step 7 发现小文案 bug 修复，最终合并一个 commit
cd "/Users/renhai2025/Desktop/云上融项目开发" && git commit -am "fix(bank-ui): final polish from prod verification" && git push
```

---

## 附：回滚预案

本 plan 无数据库迁移，所有改动集中在 3 个后端文件 + 2 个前端文件。紧急回滚：

```bash
# 找到 commit hash
git log --oneline | head -20

# revert 整串（从 Task 1 的 commit 开始到最后）
git revert --no-edit <first-commit>^..<last-commit>
git push
```

旧客户报告的 `loan_cover_ratio` JSON 字段依然在数据库（`DiagnosisRecord.bank_snapshot` 里），新前端的兼容 fallback 能读到，回滚后老前端也能读，**双向兼容无需额外处理**。
