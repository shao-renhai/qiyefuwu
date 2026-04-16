# 客户管理与案例库 MVP 设计

**日期：** 2026-04-17
**作者：** 创始人 + Claude 协作设计
**状态：** 待审阅

---

## 一、背景与目标

### 背景

云上融平台已具备征信分析、流水分析、融资诊断三大核心模块。下一步的战略核心是将创始人 **12 年融资案例经验** 数字化，作为平台的长期壁垒资产。最终目标是建立一个向量化的案例知识库，支撑 AI 给出更精准的方案匹配。

当前团队构成：
- 创始人 1 人 —— 案例判断权威、12 年经验拥有者
- 谈单顾问 2 人 —— 接待已邀约到店的精准客户，出方案
- 电话销售若干人 —— 寻找意向客户，做初步资质询问与意向判断

### 战略顺序（不可乱）

1. **第一阶段（本设计覆盖）**：沉淀 50 条种子案例，建立客户漏斗和案例管理后台
2. **第二阶段（后续）**：引入向量数据库，做相似案例检索、AI 方案匹配
3. **第三阶段（后续）**：案例驱动的报告生成、订阅制知识产品

### 本 MVP 目标

- **3-4 周内**跑通客户漏斗 + 案例库的完整数据流
- **沉淀 50 条 `published` 状态的种子案例**（创始人审核过）
- **三种角色各有适合自己的入口**，数据在系统内自然流转，不再依赖 Excel/微信
- 为第二阶段的向量化打好数据基础（特别是 `narrative` 字段）

---

## 二、术语与概念

| 术语 | 定义 |
|---|---|
| **客户（Customer）** | 接触过的任何客户，从电销留资开始。一个客户一条记录。 |
| **跟进记录（Interaction）** | 对客户的每次联系记录（电话/微信/到店等），多条 |
| **案例（Case）** | 有完整信息和结果的金牌记录。进入案例库成为壁垒资产。 |
| **种子库（Seed Corpus）** | 创始人审核发布（`published` + `tier=seed`）的案例，未来进入向量库 |
| **成长库（Growth Corpus）** | 后续扩展，未来从诊断闭环产生，本 MVP 不做 |
| **叙述（Narrative）** | 顾问用口语化方式描述案例的长文本字段，是案例库最核心的沉淀内容 |

---

## 三、数据模型

### 3.1 `customers`（客户主档，新表）

所有客户（含电销意向、谈单接待、成交）共用一张表，字段随阶段逐步补齐。

```python
class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))           # 数据归属（团队内隔离用，通常为创始人账号）
    created_by_id = Column(Integer, ForeignKey("users.id"))     # 初始录入人
    assigned_to_id = Column(Integer, ForeignKey("users.id"))    # 当前负责人

    # 基础信息（电销阶段即可填）
    name = Column(String, nullable=False)
    phone = Column(String, index=True)
    company_name = Column(String, nullable=True)
    industry = Column(String, nullable=True)                    # 行业枚举：trade/restaurant/service/manufacture/...
    company_size = Column(String, nullable=True)                # 个体/小微/中型/大型
    source = Column(String, nullable=True)                      # 来源：电销/转介绍/广告/自然流量

    # 漏斗状态
    stage = Column(String, default="lead")                      # lead / invited / consulting / proposal / closed_won / closed_lost
    intent_level = Column(Integer, default=3)                   # 意向度 1-5 星
    target_amount = Column(Float, nullable=True)                # 目标金额（万元，粗粒度）
    next_follow_up_at = Column(DateTime, nullable=True)

    # 接待阶段补齐（可选）
    company_age = Column(Integer, nullable=True)
    monthly_cashflow = Column(Float, nullable=True)
    has_tax_record = Column(Boolean, nullable=True)
    collateral_type = Column(String, nullable=True)
    collateral_value = Column(Float, nullable=True)
    credit_status = Column(String, nullable=True)               # good/minor_issue/major_issue/overdue

    # 备注
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

**与现有 `Client` 表的关系**：保留现有 `Client` 表（征信/流水/诊断都挂在上面），`Customer` 是新的 CRM 层，两者并存。`Customer` 成交后如果需要做征信/流水分析，可以选择"提升为 Client"。MVP 阶段不做这个提升流程，保持两套数据独立运行。

### 3.2 `customer_interactions`（跟进记录，新表）

```python
class CustomerInteraction(Base):
    __tablename__ = "customer_interactions"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    channel = Column(String)                                    # phone/wechat/visit/meeting
    content = Column(Text)                                      # 跟进内容
    intent_level_after = Column(Integer, nullable=True)         # 跟进后的意向度更新
    next_follow_up_at = Column(DateTime, nullable=True)         # 约定的下次跟进
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 3.3 `cases`（案例库，新表）

```python
class Case(Base):
    __tablename__ = "cases"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)  # 存量案例为 null
    user_id = Column(Integer, ForeignKey("users.id"))           # 归属
    created_by_id = Column(Integer, ForeignKey("users.id"))     # 录入人
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # 审核人

    # 核心叙述字段（向量化的主要原料）
    narrative = Column(Text, nullable=False)                    # 顾问口述风格的案例描述

    # 事实字段（结构化，支持硬过滤）
    industry = Column(String)                                   # 行业枚举
    company_size = Column(String)                               # 规模
    company_age = Column(Integer, nullable=True)                # 企业年龄
    credit_status = Column(String, nullable=True)               # 征信状态
    monthly_cashflow = Column(Float, nullable=True)             # 月均流水
    has_tax_record = Column(Boolean, nullable=True)             # 纳税记录
    collateral_type = Column(String, nullable=True)             # 抵押资产类型
    collateral_value = Column(Float, nullable=True)

    # 背景字段
    visit_reason = Column(Text, nullable=True)                  # 来访原因
    core_problem = Column(Text, nullable=True)                  # 核心问题
    urgency = Column(String, nullable=True)                     # urgent/normal/relaxed
    target_amount = Column(Float, nullable=True)                # 目标金额

    # 方案字段
    solution_type = Column(String, nullable=True)               # 经营贷/消费贷/房抵/信用贷/组合/...
    recommended_bank = Column(String, nullable=True)            # 推荐银行
    preparation_actions = Column(Text, nullable=True)           # 前置动作
    duration_days = Column(Integer, nullable=True)              # 耗时（天）

    # 结果字段
    outcome = Column(String, nullable=True)                     # success/partial_success/failure/abandoned
    approved_amount = Column(Float, nullable=True)              # 获批额度
    actual_rate = Column(Float, nullable=True)                  # 实际利率（%）
    bank_tier = Column(String, nullable=True)                   # 国有大行/股份制/城商行/农商行/政策性/其他
    core_lessons = Column(Text, nullable=True)                  # 核心教训

    # 管理字段
    status = Column(String, default="draft")                    # draft / pending_review / published / archived
    tier = Column(String, default="seed")                       # seed / growth（MVP 阶段都是 seed）
    review_notes = Column(Text, nullable=True)                  # 审核意见（打回时写在这里）
    published_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

### 3.4 `users` 表扩展

新增 `role` 字段：

```python
role = Column(String, default="consultant")  # founder / consultant / telesales
```

现有用户默认为 `consultant`，创始人账号手动设为 `founder`。

---

## 四、三个入口及工作流

### 4.1 意向入口（电销使用）

**页面**：`/leads` —— 意向池

**布局**：
- 顶部：快速录入表单（姓名/电话/行业/来源/意向度/目标金额/备注/下次跟进时间）
- 中部：我的待跟进列表（按 `next_follow_up_at` 排序，今天过期的高亮红色）
- 底部：我录入的所有意向客户列表（支持按意向度、阶段筛选）

**操作**：
- 新建意向客户 → `stage=lead`，填 6-8 个基础字段即可
- 点击进入客户详情 → 添加跟进记录（通话内容、意向变化）
- 点击"邀约成功" → `stage=invited`，同时指定一个谈单顾问（`assigned_to_id`）

### 4.2 接待入口（谈单顾问使用）

**页面**：`/customers` —— 我的客户

**布局**：
- 顶部：待接待的已邀约客户列表（`assigned_to_id = 我` 且 `stage=invited`）
- 中部：正在接待中的客户（`stage=consulting`）
- 底部：全部我负责的客户列表

**操作**：
- 点击"已邀约"的客户进入详情 → 补齐接待字段（企业年龄、流水、抵押等）→ `stage=consulting`
- 接待完成 → 点"开始出方案" → `stage=proposal`
- 方案落地后 → 点"案例归档" → 创建 `cases` 表的一条 `draft` 记录，预填所有已有字段，跳转到案例编辑页
- 客户放弃 → 点"标记丢单" → `stage=closed_lost`，填丢单原因到 notes

### 4.3 案例入口（创始人 + 谈单顾问使用）

**页面**：`/cases` —— 案例库

**布局**：
- 顶部：Tab 切换 —— 我的草稿 / 待审核（仅创始人） / 已发布 / 已归档
- 主体：案例卡片列表 + 搜索/筛选（行业、结果、金额区间、银行）
- 右上角：创始人独有的"+ 新建存量案例"按钮（直接进入空白表单，`customer_id=null`）

**录入表单**（核心）：
```
━━━ 案例叙述 ━━━
[大文本框]
提示文字："用你跟新顾问讲案例的语气，把这单完整说清楚：客户什么情况？
遇到什么问题？你当时怎么判断？推荐了什么方案？最后什么结果？
踩过什么坑或有什么经验？3-8 分钟，想到什么说什么。"

━━━ 事实字段 ━━━
行业 [下拉]   规模 [下拉]   企业年龄 [数字]
征信状态 [下拉]   月均流水 [数字]   纳税 [是/否]
抵押类型 [下拉]   抵押价值 [数字]

━━━ 背景字段 ━━━
来访原因 [短文本]   核心问题 [短文本]
紧迫度 [下拉]   目标金额 [数字]

━━━ 方案字段 ━━━
方案类型 [下拉]   推荐银行 [短文本]
前置动作 [短文本]   耗时(天) [数字]

━━━ 结果字段 ━━━
结果 [下拉]   获批额度 [数字]   实际利率% [数字]
银行层级 [下拉]   核心教训 [短文本]

[保存草稿]  [提交审核]
```

**必填项**：`narrative`、`industry`、`outcome` 三个字段。其余全部可选。这样即便是匆忙记的案例也能先留住最核心信息。

**审核流程**（创始人视角）：
- 打开"待审核" Tab → 点击任意案例 → 查看详情 → 可编辑任何字段 → 选择：
  - **发布** → `status=published`，`published_at=now()`，案例进入种子库
  - **打回** → `status=draft`，`review_notes` 写明修改建议，回到顾问草稿箱
- 创始人录入存量案例时，可以直接一步录完点"发布"，跳过审核（role=founder 的绿色通道）

---

## 五、权限与可见性

### 5.1 角色表

| 角色 | 标识 | 描述 |
|---|---|---|
| 创始人 | `founder` | 全部权限 + 审核权 |
| 谈单顾问 | `consultant` | 接待 + 案例录入 + 已发布案例库只读 |
| 电销 | `telesales` | 仅意向池 + 自己的客户跟进 |

### 5.2 权限矩阵

| 资源 / 操作 | 电销 | 谈单顾问 | 创始人 |
|---|---|---|---|
| 意向池 录入新客户 | ✅ | ❌ | ✅ |
| 意向池 改/删自己录入的 | ✅（仅 `stage=lead`） | ❌ | ✅ |
| 意向池 添加跟进记录 | ✅（自己录入或自己是 assigned_to） | ✅（自己是 assigned_to） | ✅ |
| 意向池 邀约成功→指派给谈单顾问 | ✅ | ❌ | ✅ |
| 客户详情 查看 | ✅（自己录入的） | ✅（自己是 assigned_to） | ✅（全部） |
| 客户详情 进入接待阶段（lead→consulting） | ❌ | ✅（自己是 assigned_to） | ✅ |
| 客户详情 补齐接待字段 | ❌ | ✅（自己是 assigned_to） | ✅ |
| 案例草稿 录入 | ❌ | ✅ | ✅ |
| 案例草稿 改自己的 | ❌ | ✅ | ✅ |
| 案例库 已发布 浏览 | ❌ | ✅（只读） | ✅ |
| 案例审核（发布/打回） | ❌ | ❌ | ✅ |
| 存量案例直接录入+发布 | ❌ | ❌ | ✅ |
| 删除案例 | ❌ | ❌ | ✅ |

### 5.3 实现要点

- 后端路由用 `Depends(get_current_user)` + 新增 `require_role(['founder'])` 依赖项做权限校验
- 用户 `role` 字段通过管理员脚本手动设置（MVP 阶段不做"角色管理页面"）
- 数据隔离：意向池的"只看自己的"通过 `created_by_id = current_user.id` 过滤实现

---

## 六、API 端点清单

### 6.1 `/api/customers/*`（新）

| Method | Path | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/customers` | 新建客户（意向） | 电销/顾问/创始人 |
| GET | `/api/customers` | 列表（按角色过滤） | 全部 |
| GET | `/api/customers/{id}` | 详情 | 负责人/创始人 |
| PUT | `/api/customers/{id}` | 更新（含阶段流转） | 负责人/创始人 |
| DELETE | `/api/customers/{id}` | 删除 | 创始人 |
| POST | `/api/customers/{id}/assign` | 指派给谈单顾问 | 创始人或录入人 |
| POST | `/api/customers/{id}/interactions` | 添加跟进记录 | 负责人/创始人 |
| GET | `/api/customers/{id}/interactions` | 跟进记录列表 | 负责人/创始人 |

### 6.2 `/api/cases/*`（新）

| Method | Path | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/cases` | 新建案例（顾问创建时强制 `status=draft`；创始人可传 `status=published` 走绿色通道直接发布存量案例） | 顾问/创始人 |
| GET | `/api/cases` | 列表（过滤：status/tier/industry/outcome） | 顾问（只能看自己的草稿 + 全部已发布）/创始人（全部） |
| GET | `/api/cases/{id}` | 详情 | 同上 |
| PUT | `/api/cases/{id}` | 更新 | 录入人（draft 阶段）/创始人（任何阶段） |
| POST | `/api/cases/{id}/submit` | 提交审核 | 录入人 |
| POST | `/api/cases/{id}/publish` | 发布 | 创始人 |
| POST | `/api/cases/{id}/reject` | 打回修改 | 创始人 |
| POST | `/api/cases/{id}/archive` | 归档 | 创始人 |
| DELETE | `/api/cases/{id}` | 删除 | 创始人 |

### 6.3 `/api/cases/from-customer/{customer_id}`（便捷接口）

一键从客户详情创建案例草稿，自动带入已有字段。

---

## 七、前端页面

### 7.1 新增 PageKey

```typescript
type PageKey = 'dashboard' | 'credit' | 'bank' | 'calculator' | 'diagnostic'
             | 'leads' | 'customers' | 'cases';
```

### 7.2 侧边菜单分组

```
├─ 工作台（Dashboard）
├─ ─── 客户 ───
│   ├─ 意向池（Leads）        [电销/创始人可见]
│   ├─ 我的客户（Customers）   [顾问/创始人可见]
│   └─ 案例库（Cases）         [顾问/创始人可见]
├─ ─── 分析 ───
│   ├─ 征信分析
│   ├─ 流水分析
│   └─ 融资诊断
└─ ─── 工具 ───
    └─ 贷款计算器
```

菜单项按当前用户 `role` 动态过滤。

### 7.3 新增组件

- `pages/Leads.tsx` —— 意向池
- `pages/Customers.tsx` —— 客户接待管理
- `pages/CustomerDetail.tsx` —— 客户详情（嵌入跟进记录时间线）
- `pages/Cases.tsx` —— 案例库列表
- `pages/CaseForm.tsx` —— 案例录入/编辑页（叙述 + 字段）
- `pages/CaseReview.tsx` —— 创始人审核视图（可复用 CaseForm + 发布/打回按钮）

---

## 八、MVP 范围界定

### 8.1 本期必做（3-4 周）

- [x] 数据模型：`customers` / `customer_interactions` / `cases` 三张表 + `users.role`
- [x] 后端：两个 router（`customers.py` / `cases.py`）+ 权限中间件
- [x] 前端：6 个新页面 + 菜单集成 + API 函数
- [x] 权限矩阵按角色正确隔离
- [x] 案例审核工作流（提交/发布/打回）
- [x] 数据库迁移脚本 + 给创始人账号设 `role=founder`
- [x] 部署上线并让团队开始使用

### 8.2 本期不做（留给后续阶段）

- 向量化和相似案例检索 —— 等种子库满 50 条再做
- 诊断→案例的补录入口 —— 第二期做
- 漏斗自动化 / 自动分配 / KPI 看板 / 转化率分析 —— 第三期做
- 案例版本历史 / 审核变更审计日志 —— 第三期做
- 客户导入/导出（批量从 Excel 导入） —— 按需加
- 移动端适配 —— 后期
- 多租户 / 团队管理 —— 后期
- 成长库机制 + tier 升级 —— 等种子库稳定后做
- Customer 提升为 Client 做征信/流水分析的流程 —— 按需加

### 8.3 验收标准

- 电销账号登录后只看到"意向池"菜单，能录入和管理自己的客户
- 谈单顾问账号登录后看到"意向池"（只读被分配的）+"我的客户"+"案例库"
- 创始人账号登录后看到全部菜单 + 审核 Tab
- 从意向池"邀约成功"一直到"案例归档+发布"的完整流程能走通
- 案例录入表单中叙述字段占据最突出位置，提示语引导口语化描述
- 创始人录入 10 条存量案例，3 条经审核的顾问草稿案例，全部通过 `published`
- 案例库列表按行业/结果筛选功能可用

---

## 九、成功标准（3-4 周后）

1. **数量**：案例库至少 50 条 `published` 状态的案例
2. **质量**：每条案例都有完整的 `narrative`（不少于 200 字）+ 至少 10 个结构化字段
3. **覆盖**：至少涵盖 5 个行业、3 种方案类型、4 种结果（含成功和失败）
4. **流程**：团队每周贡献案例的节奏稳定（创始人 + 2 顾问每周共 10-15 条）
5. **数据卫生**：意向池 → 客户 → 案例的流转数据在系统里可追溯（不依赖外部记录）

---

## 十、风险与缓解

| 风险 | 缓解 |
|---|---|
| 顾问不习惯写叙述，填字段应付了事 | 表单必填项只保留 3 个，叙述字段给明确提示语；创始人审核时打回应付型案例 |
| 电销觉得留资系统比微信麻烦，不用 | 留资表单字段极简（6-8 个），新建一条 ≤ 30 秒；配合月底奖金核算挂钩留资数据 |
| 创始人审核成瓶颈 | 50 条内瓶颈可接受；审核 UI 设计为"一屏看完一条"，批量审核每条 < 2 分钟 |
| 存量案例录入工作量大，拖节奏 | 叙述字段降低录入门槛；允许匆忙录入只填 3 个必填项先保住案例，事后再补 |
| 历史客户 Excel 数据没有导入，团队双头维护 | MVP 不做批量导入，让团队新客户从系统起，老客户保持原流程自然过期。如果 2 周后反馈强烈，临时加一个 Excel 导入脚本。 |
| 向量化延迟到 50 条以后才做，团队质疑"系统好像没用" | 在案例库页面显示"已积累 X/50 条种子案例，满 50 启动 AI 匹配"，用进度条强化"正在建壁垒"的感觉 |

---

## 十一、架构与代码组织

### 11.1 后端文件新增

```
backend/
├── db/database.py              [修改：新增 Customer/CustomerInteraction/Case 模型 + User.role]
├── routers/
│   ├── customers.py           [新增]
│   └── cases.py                [新增]
├── services/
│   ├── permissions.py         [新增：require_role 依赖项]
│   └── case_helpers.py         [新增：from-customer 字段映射等]
└── main.py                     [修改：注册新 router]
```

### 11.2 前端文件新增

```
frontend/src/
├── pages/
│   ├── Leads.tsx              [新增]
│   ├── Customers.tsx          [新增]
│   ├── CustomerDetail.tsx     [新增]
│   ├── Cases.tsx              [新增]
│   ├── CaseForm.tsx           [新增]
│   └── CaseReview.tsx         [新增]
├── components/
│   ├── CustomerStageTag.tsx   [新增：阶段标签]
│   ├── CaseStatusTag.tsx      [新增：案例状态标签]
│   └── InteractionTimeline.tsx[新增：跟进时间线]
├── services/api.ts            [修改：新增 Customer/Case 相关 API 函数]
├── types/
│   └── customer.ts             [新增：TS 类型]
│   └── case.ts                 [新增：TS 类型]
└── App.tsx                    [修改：PageKey + 菜单 + 角色过滤]
```

### 11.3 数据库迁移

新增迁移脚本 `backend/scripts/migrate_case_library.py`：
- `ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'consultant'`
- 创建 `customers` / `customer_interactions` / `cases` 三张表
- 把创始人账号的 `role` 设置为 `founder`

---

## 十二、后续阶段展望（不在 MVP 内，仅作架构参考）

### 第二阶段：向量化

当 `cases` 表达到 50 条 `published` 记录时，启动：
- 引入 Chroma / pgvector 作为向量存储
- 对每条 `published` 案例做嵌入（`narrative` 字段为主，结合关键结构化字段的拼接）
- 新增 `/api/cases/search-similar` 端点：根据新客户情况做语义检索
- 融资诊断报告 → 自动挂载 TOP3 相似案例，展示在报告里

### 第三阶段：AI 方案匹配

- 诊断完成时，AI 基于 TOP3 相似案例 + 当前客户情况，生成初步方案建议
- 建议由谈单顾问微调后给客户
- 每个 AI 建议被采纳 / 拒绝 / 修改的反馈会回流到案例权重

### 第四阶段：生态

- 付费报告产品：含"基于 X 个相似案例的方案推荐"卖点
- 订阅产品：月度案例精选推送
- 顾问入驻：外部顾问贡献案例，按案例使用次数分成

---

## 附录 A：行业枚举（初版）

```
trade           批发贸易
retail          零售
restaurant      餐饮
service         一般服务业
manufacture     制造业
construction    建筑施工
medical         医疗大健康
tech            科技/互联网
logistics       物流运输
agriculture     农业
real_estate     房地产相关
education       教育
other           其他
```

## 附录 B：方案类型枚举（初版）

```
经营贷
消费贷
房产抵押
车辆抵押
保单贷
信用贷
税务贷
发票贷
政府贴息贷
担保贷
组合方案
其他
```

## 附录 C：银行层级枚举

```
国有大行   工农中建交邮储
股份制     招商、平安、兴业、浦发、民生、光大、中信、华夏、浙商、渤海
城商行     北京、上海、江苏、宁波、南京、杭州等
农商行
政策性     国开、进出口、农发
外资
其他       含民营银行、信托、消金、小贷
```

---

**文档结束。**
