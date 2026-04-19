# M2: Founder Dashboard + API 规范化 设计文档

> **日期:** 2026-04-19
> **范围:** 里程碑 M2(约 2 周,独立可上线)
> **依赖:** M1 必须先上线(使用 `has_capability` / `admin_console`)
> **后续:** 未来 C 端独立项目(通过调本里程碑规范化后的 API 接入)

---

## 1. 目标

**一句话:** 把 Founder 后台从"用户管理 V1"扩展为"看得见业务全景的指挥中心",同时把后端 API 规范化成**未来 C 端可以直接对接的契约**。

具体 4 件事,都在本里程碑内完成:

1. **API 版本化 + 权限补齐**:所有路由迁到 `/api/v1/`,补齐 M1 调研发现的缺失权限检查,产出 `docs/API.md` 对外对接手册
2. **Founder Dashboard**:替换现有静态 Dashboard.tsx,按角色显示不同面板 — Founder 看到业务全景(注册/漏斗/产能/功能使用量),顾问看到个人工作台
3. **客户池阶段增强**:Customer 表新增结案字段(`approved_amount / actual_rate / rejection_reason`),列表对"已放款/已拒绝"有可视化卡片,详情页加"结案登记"UI
4. **客户分配手动 UI**:Founder 在后台能看到"未分配的新线索"并手动派给某顾问(现有 `POST /customers/{id}/assign` API 已存在,补前端)

---

## 2. 不在范围内(明确推迟)

| 推迟事项 | 原因 | 去向 |
|---|---|---|
| C 端 shell / 注册 / 登录 | 战略推迟 | 未来独立 C 端项目 |
| 响应体 envelope 改造(`{success, data, error}`) | 86% 路由已有 response_model,强推 envelope 会破坏现有前端,成本高收益低 | 未来如果真有外部第三方对接再议 |
| 客户池**自动**分配规则(按容量/轮询/区域) | 产品侧需观察手动分配数据后再定规则 | Backlog,M3 或后期 |
| 订阅付费接入 | 战略推迟 | 未来 C 端项目 |
| 征信付费高级版 | 战略推迟 | 未来 C 端项目 |
| 审计日志独立表 | M1 已留 granted_by_id + granted_at | 如果合规要求则 M3 |
| Dashboard 上的实时 WebSocket 推送 | YAGNI | 刷新页面即可,数据量不大 |

---

## 3. 架构总览

```
┌────────────────────────── 前端 ──────────────────────────┐
│ Dashboard.tsx (重构)                                     │
│   ├─ 按 role 条件渲染                                    │
│   │   └─ founder: FounderOverviewPanel                  │
│   │   └─ senior/junior: ConsultantWorkbench             │
│   └─ 保留快速操作入口                                    │
│                                                         │
│ 新增页面:                                                │
│   └─ /admin/leads      未分配线索列表 + 手动分配         │
│                                                         │
│ 客户池页改造:                                             │
│   └─ 列表增加"已放款/已拒绝"状态卡                         │
│   └─ 详情页新增"结案登记"模态框                            │
└─────────────────────────────────────────────────────────┘
                           ↓ 调 /api/v1/*
┌────────────────────────── 后端 ──────────────────────────┐
│ 路由迁移:所有 router 的 prefix 改 /api/v1                │
│   └─ 保留 /api/ 同时挂载(双写过渡期 2 周,deploy 后删除)   │
│                                                         │
│ services/dashboard_stats.py  ◄── 新增                    │
│   ├─ founder_overview(db) → FounderOverview 聚合         │
│   └─ consultant_workbench(user, db) → 顾问个人数据       │
│                                                         │
│ routers/admin.py  ◄── 扩展                                │
│   ├─ GET /api/v1/admin/dashboard                        │
│   └─ GET /api/v1/admin/unassigned-leads                 │
│                                                         │
│ routers/customers.py  ◄── 扩展                            │
│   └─ POST /api/v1/customers/{id}/close                  │
│     结案登记(写 approved_amount 等 + stage 流转)         │
│                                                         │
│ 权限补齐(bug fix):                                       │
│   ├─ credit_report.py:5 个路由加 get_current_user       │
│   ├─ diagnosis.py:3 个路由加 get_current_user           │
│   └─ bank_statement.py:3 个路由加 get_current_user      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌───────────────────── DB(SQLite) ──────────────────────┐
│ customers  ◄── 新增 3 个字段                            │
│   approved_amount  Float  NULL   (已批准金额)           │
│   actual_rate      Float  NULL   (实际利率 %)           │
│   rejection_reason Text   NULL   (拒绝原因)             │
└─────────────────────────────────────────────────────────┘
```

---

## 4. API 规范化

### 4.1 版本化 prefix

**迁移策略:** 所有 router 从 `/api/xxx` 迁到 `/api/v1/xxx`。

**过渡期:** 在 `main.py` 把每个 router **同时挂载两次**,旧路径保留 2 周:
```python
app.include_router(customers_router, prefix="/api/v1")
app.include_router(customers_router, prefix="/api")  # deprecated
```
第二次 deploy(M2 上线 2 周后)删除 `/api/` 挂载。前端本次 deploy 同步切到 `/api/v1/`。

**不破坏现有前端**:前端 `services/api.ts` 的 `BASE_URL` 从 `/api` 改 `/api/v1`,一行改动。

### 4.2 补齐缺失的权限检查(重要 bug 修复)

M1 调研发现以下路由无权限检查,M2 必须修:

| 文件 | 路由 | 当前 | M2 要改成 |
|---|---|---|---|
| credit_report.py | `PUT /credit-report/{id}/manual` | 无 | `Depends(require_capability("credit_analysis"))` + 资源归属校验 |
| credit_report.py | `GET /credit-report/{id}/manual` | 无 | 同上 |
| credit_report.py | `GET /credit-report/{id}/analysis-report` | 无 | 同上 |
| credit_report.py | `GET /credit-report/client/{id}` | 无 | 同上 |
| credit_image.py | `GET /credit-image/file/{filename}` | 无 | `Depends(get_current_user)` + 文件所属客户归属校验 |
| credit_image.py | `DELETE /credit-image/{id}` | 无 | `Depends(require_capability("credit_analysis"))` + 归属校验 |
| bank_statement.py | `GET /bank-statement/client/{id}/statements` | 无 | `Depends(require_capability("bank_analysis"))` + 归属校验 |
| bank_statement.py | `GET /bank-statement/client/{id}/context` | 无 | 同上 |
| bank_statement.py | `PUT /bank-statement/client/{id}/context` | 无 | 同上 |
| diagnosis.py | `PUT /diagnosis/{id}` | 无 | `Depends(get_current_user)` + 归属校验 |
| diagnosis.py | `POST /diagnosis/report` | 无 | 同上 |
| diagnosis.py | `GET /diagnosis/list` | 无 | 同上 |
| diagnosis.py | `GET /diagnosis/{id}/share` | 无 | 同上 |

**例外**(保留无权限):
- `GET /diagnosis/report/{token}` — 对外分享链接,必须匿名可访问
- `GET /health` — 健康检查

**资源归属校验**的统一模式(`services/permissions.py` 里新增工具函数):
```python
def check_customer_ownership(customer: Customer, user: User, db: Session) -> None:
    """允许 founder(持 admin_console)、或 customer.assigned_to_id == user.id 的顾问通过"""
    if has_capability(user, "admin_console", db):   # founder 可看全部
        return
    if customer.assigned_to_id == user.id:
        return
    raise HTTPException(403, detail="无权访问该客户数据")
```

使用方(示例,credit_report 路由):
```python
def get_report(
    report_id: int,
    user: User = Depends(require_capability("credit_analysis")),
    db: Session = Depends(get_db),
):
    report = db.query(CreditReport).filter_by(id=report_id).first()
    if not report:
        raise HTTPException(404)
    customer = db.query(Customer).filter_by(id=report.client.customer_id).first()
    check_customer_ownership(customer, user, db)
    return report
```

### 4.3 OpenAPI schema 补齐

- 每个路由的 `summary` / `description` 都写中文一句话说明
- 抽查还没有 `response_model` 的 7 个路由,补上(文件下载类可以不加)
- 所有自定义 Pydantic schema 放在 `backend/models/schemas/`(如果已有其他位置就不动),避免散落

### 4.4 产出 `docs/API.md` 对外对接手册

结构:
1. **认证** — `POST /auth/login` 拿 JWT,header `Authorization: Bearer <token>`
2. **版本策略** — 当前 `/v1`,breaking change 时升 `/v2`
3. **权限模型简述** — role + capability,外部对接者看 `effective_capabilities` 决定 UI
4. **错误约定** — HTTP 状态码 + `{"detail": "..."}`
5. **核心资源对照表** — 资源名 / URL / 字段定义(链接到 OpenAPI schema)
6. **未来 C 端对接示例** — 列出 3 个常用场景(用户自助看自己的征信;计算贷款;查申请进度)

**生成策略:** 手写 API.md 大框架,FastAPI 自动生成 OpenAPI schema 的 URL 在文档里引用即可(`GET /openapi.json`)。

### 4.5 "C 端预埋接口"(为未来独立 C 端项目留窗口)

以下接口**在 M2 只加路由 shim,复用现有 service**,UI 不实现:

| 路由 | 业务 | 复用 service |
|---|---|---|
| `GET /api/v1/me/credit-reports` | 登录用户看自己的征信 | 取 `user.clients → credit_reports` |
| `GET /api/v1/me/bank-statements` | 登录用户看自己的流水 | 取 `user.clients → bank_statements` |
| `GET /api/v1/me/diagnosis` | 登录用户看自己的诊断 | 同上 |

这些接口在 M2 **已经可以正常工作**,未来 C 端项目直接调用,无需后端再改。B 端使用场景下这些接口对 founder/顾问也能用(他们分析的客户数据会归在自己名下)。

**仅 3 个 route shim,约 30 行代码。**

---

## 5. Founder Dashboard(业务全景)

### 5.1 后端聚合 `services/dashboard_stats.py`

**函数签名:**
```python
def founder_overview(db: Session) -> FounderOverview:
    """生成 founder 专属的全业务概览"""
    return FounderOverview(
        users=UserStats(
            total_b_end=...,               # 非 c_end 用户数
            total_c_end=...,               # c_end 用户数(M2 总为 0,预埋)
            new_this_week=...,
            new_this_month=...,
            by_role={"founder": 1, "senior_consultant": 3, "junior_consultant": 8},
        ),
        funnel=CustomerFunnel(
            lead=...,
            invited=...,
            consulting=...,
            proposal=...,
            closed_won=...,
            closed_lost=...,
            conversion_rate=closed_won / (closed_won + closed_lost) * 100,  # %
        ),
        consultant_productivity=[
            ConsultantProductivity(
                user_id=3, display_name="张三",
                active_customers=12, closed_won_this_month=2,
                avg_days_to_close=15.3
            ),
            # ... 按 closed_won_this_month 降序
        ],
        feature_usage=FeatureUsage(
            credit_reports_this_week=...,
            bank_statements_this_week=...,
            diagnosis_reports_this_week=...,
        ),
        generated_at="2026-04-19T10:00:00",
    )
```

**实现要点:**
- 所有 query 一次 DB 事务,避免 N+1
- 按周/月统计用 `datetime.utcnow() - timedelta(days=7/30)`
- 冷启动阶段数据少,不做 cache,每次 API 直查(M3 如果慢再加 5 分钟 TTL cache)

### 5.2 Endpoint

`GET /api/v1/admin/dashboard` — `Depends(require_capability("admin_console"))`

返回 `FounderOverview` JSON。

### 5.3 前端 `FounderOverviewPanel` 组件

布局(Ant Design `Row` + `Col`):

```
┌─────────────────────────────────────────────────────────┐
│ 第 1 行:4 个 Statistic 大数字卡                         │
│ [B端用户 15]  [C端用户 0]  [本周新增 3]  [活跃客户 42]  │
├─────────────────────────────────────────────────────────┤
│ 第 2 行:客户漏斗 (横向 FunnelChart 或自绘阶梯条)        │
│   意向(20) → 邀约(12) → 咨询(8) → 方案(4) → 放款(2)    │
│   转化率 67% (已放款/已关单)                             │
├─────────────────────────────────────────────────────────┤
│ 第 3 行 左:顾问产能表格                                 │
│   顾问 | 在跟客户 | 本月放款 | 平均成交天数             │
│   张三 |   12     |   2      |   15.3                  │
│   李四 |    8     |   1      |   22.0                  │
│                                                         │
│ 第 3 行 右:功能使用量(本周)                              │
│   征信分析 8 次 / 流水分析 5 次 / 诊断 3 次              │
└─────────────────────────────────────────────────────────┘
```

**不做**:
- 不做时间趋势折线图(留 M3)
- 不做颜色编码热度图
- 不做导出 CSV(需要时再加)

**用 Ant Design 原生组件**:`Statistic`、`Table`、`Progress`(阶梯条用 Progress 连着画即可)。**不引入 echarts/recharts**,保持依赖纯净。

### 5.4 顾问个人工作台 `ConsultantWorkbench`(senior / junior 都用这个)

`GET /api/v1/me/workbench` — 任何登录用户都能调。

返回:
```python
ConsultantWorkbench(
    assigned_customers_count=12,
    follow_up_due_today=3,
    follow_up_due_this_week=8,
    pending_cases=2,        # 我创建的 draft/pending_review 案例
    recent_interactions=[...],  # 最近 5 条跟进记录
)
```

布局:4 个 Statistic 卡 + 一个"今日待跟进客户"表格。比 founder 面板简单,**约 50 行前端代码**。

---

## 6. 客户池阶段增强

### 6.1 Customer 表字段扩展

新增 3 个 nullable 字段:
```python
approved_amount = Column(Float, nullable=True)       # 已批准金额(closed_won)
actual_rate = Column(Float, nullable=True)           # 实际利率 %
rejection_reason = Column(Text, nullable=True)       # 拒绝原因(closed_lost)
```

迁移脚本:`backend/scripts/migrate_customer_close_fields.py`,`ALTER TABLE customers ADD COLUMN ...`,SQLite 支持。

### 6.2 结案登记 API

`POST /api/v1/customers/{id}/close` — `Depends(require_capability("customer_pool"))`

**请求体:**
```json
{
  "outcome": "won",            // "won" | "lost"
  "approved_amount": 3000000,  // outcome=won 时必填
  "actual_rate": 4.5,          // outcome=won 时必填
  "rejection_reason": "...",   // outcome=lost 时必填
  "solution_summary": "..."    // 可选:方案摘要(存入 notes)
}
```

**业务规则:**
- `outcome=won` → `stage=closed_won`,写入 approved_amount+actual_rate
- `outcome=lost` → `stage=closed_lost`,写入 rejection_reason
- 允许从 `{invited, consulting, proposal}` 任一阶段过渡到 closed_xxx(覆盖"客户谈到一半直接拒绝"的场景);从 `lead` 或已 closed 调用返 400
- 归属校验:仅 `assigned_to_id == user.id` 或 founder 能调

### 6.3 客户池列表卡片化增强

当前 `CustomerStageTag`(green=已成交/red=已流失)保留。**新增:列表行展开一条辅助信息区**:
- `closed_won`:`💰 已放款 ¥300万 @4.5%` | `[生成案例]` 按钮
- `closed_lost`:`❌ 已拒绝 — 征信问题` | `[终止合同]` 按钮(仅更新 notes,实际不删)
- 其他 stage:保留现有展示(intent_level 星级、下次跟进时间)

**不改**列表整体结构,只在每行下方加 `<div className="row-addon">`。

### 6.4 客户详情页 "结案登记" 模态框

在 `CustomerDetail.tsx`,当 `stage === 'proposal'` 时,页面顶部显示按钮"登记结果"。点开 `Modal`,表单:

```
结果  [won ●  lost ○]
  ┌─ outcome=won ─────────────┐
  │ 已批准金额 * [________]    │
  │ 实际利率 %  * [______]    │
  │ 方案摘要    [textarea]    │
  └───────────────────────────┘
  ┌─ outcome=lost ────────────┐
  │ 拒绝原因 *  [textarea]    │
  └───────────────────────────┘
[取消]  [确认登记]
```

确认后 `POST /customers/{id}/close`,成功后 `message.success` + 刷新页面。

---

## 7. 客户分配手动 UI

### 7.1 现状
- 已有 `POST /api/v1/customers/{id}/assign` — founder 可调
- 现有流程:founder 用 SQL 或 Postman 手动改 `assigned_to_id`(痛!)

### 7.2 M2 新增

**页面 `/admin/leads`** (founder 专属,左侧菜单"系统管理"下一级):

- 顶部:Statistic 卡"未分配线索 `<count>`"
- 表格列:姓名/电话/公司/意向等级/来源/创建时间/操作
- 查询源:`GET /api/v1/admin/unassigned-leads` — 返回所有 `assigned_to_id IS NULL` 的 Customer
- 行操作"分配"按钮 → 弹 `Modal` 选顾问(dropdown 列出所有 `role in (junior_consultant, senior_consultant)` 的 active user)→ 调 `POST /customers/{id}/assign`

**新增 API:** `GET /api/v1/admin/unassigned-leads` — `Depends(require_capability("admin_console"))`,返回未分配客户列表。

**自动分配:** 不做。M3 再议。

---

## 8. 测试策略

### 8.1 单元测试
- `test_dashboard_stats.py`:
  - 空数据库返回全零,不炸
  - funnel 各 stage 计数正确
  - conversion_rate = closed_won / (closed_won + closed_lost) * 100;全 0 时返 0 不返 NaN
  - consultant_productivity 排序正确
  - feature_usage 的时间窗口边界(刚满 7 天的记录算进去 vs 不算)
- `test_customers_close.py`:
  - `outcome=won` 成功写字段,stage 变 closed_won
  - `outcome=lost` 成功写 rejection_reason,stage 变 closed_lost
  - 从 invited/consulting/proposal 任一阶段都可结案
  - 从 lead 或已 closed 状态结案返 400
  - 非归属者调用返 403
  - won 缺 approved_amount 返 422
- `test_me_shims.py`:
  - `/me/credit-reports` 返回当前用户名下客户的征信,不混入其他用户数据

### 8.2 权限补齐回归
- `test_credit_report_auth.py`、`test_bank_statement_auth.py`、`test_diagnosis_auth.py`:
  - 未登录访问返 401
  - 跨用户访问返 403
  - 本用户访问返 200
  - 分享 token 仍然匿名可用(diagnosis 特例)

### 8.3 API 版本化回归
- `test_api_versioning.py`:
  - `/api/v1/customers` 可访问
  - `/api/customers` **同一 deploy 内也可访问**(双写过渡期)
  - deploy 2 周后清理 /api/ 时,该测试会挂 — 这是预期(测试同步删除)

### 8.4 手工测试清单
1. founder 登录 → 首页看到 FounderOverviewPanel(数字可能都是测试数据)
2. junior 登录 → 首页看到 ConsultantWorkbench(个人面板)
3. founder 进 `/admin/leads` → 看到所有未分配客户,点"分配" → 选顾问 → 刷新列表该条消失
4. 该顾问登录 → 意向池能看到这个客户
5. 在 proposal 阶段的客户,详情页点"登记结果" → 选 won → 填金额 4.5% → 保存 → 页面 stage 变 closed_won + 展示卡出现
6. 同上选 lost → 保存 → stage 变 closed_lost + 拒绝原因展示
7. 前端 `services/api.ts` 改 `/api/v1`,全功能回归:登录、创建客户、上传征信、流水分析、查诊断
8. 用 Postman 以顾问 A 的 token 访问顾问 B 的客户征信 → 返 403(bug 修复验证)

---

## 9. 交付验收清单

M2 完成必须同时满足以下:

- [ ] 所有新增/修改的后端测试通过,**0 失败**
- [ ] 38 个 endpoint 全部迁移到 `/api/v1/`,旧路径双写过渡期保留
- [ ] `services/api.ts` 的 `BASE_URL` 改 `/api/v1`,前端全功能回归通过
- [ ] 13 个缺失权限的路由全部补齐,8 条跨用户越权手工测试返 403
- [ ] `docs/API.md` 撰写完成并 commit
- [ ] `GET /api/v1/admin/dashboard` 返回完整 FounderOverview,前端 Dashboard 对 founder 显示新面板
- [ ] 顾问登录看到个人工作台,不再是静态卡
- [ ] Customer 表 3 个新字段迁移成功,生产 DB 备份在先
- [ ] 结案登记 API + UI 上线,won/lost 两种流程走通
- [ ] `/admin/leads` 未分配线索页可用,手动分配成功
- [ ] 3 个 `/me/*` shim 路由返回正确数据(用 pytest 验证)
- [ ] `docs/PROGRESS.md` M2 行标为"上线 ✅ + commit hash"

---

## 10. 风险与回滚

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 前端 BASE_URL 改错导致登录立即挂 | 中 | 高 | 本地先全流程跑一遍;双写过渡期兜底(新旧同时可用) |
| 权限补齐后现有顾问流程被误拦 | 中 | 中 | 手工测试清单覆盖 8 条越权场景;灰度 founder 账号先验 |
| Customer 新增字段 ALTER 在生产跑挂 | 低 | 高 | SQLite `ALTER TABLE ADD COLUMN` 是原生支持;上线前备份 `finance.db` |
| Dashboard query 慢(数据多) | 低 | 低 | M2 数据量小不会慢;若慢 M3 加 5 分钟 TTL cache |
| `/api/v1` 双写挂载后删除忘记 | 中 | 低 | PROGRESS.md 写明"2 周后需下线 `/api/` 挂载",触发提醒 |
| 诊断分享链接被误拦 | 低 | 中 | 单独跳过 `/diagnosis/report/{token}` 的权限,单测覆盖 |

**回滚预案:**
- M2 上线出问题 → `git revert <merge-commit>` → restart
- Customer 新字段 nullable,回滚后保留空值无害
- /api/v1 迁移是双写,回滚只是前端切回 /api

---

## 11. 工期预估

| 任务组 | 估时 |
|---|---|
| API 版本化 + 双写挂载 | 0.5 天 |
| 补齐 13 个路由权限 + 资源归属校验工具 | 1-2 天 |
| 撰写 docs/API.md + OpenAPI schema 补完 | 1 天 |
| 3 个 /me/* shim 路由 | 0.5 天 |
| dashboard_stats 聚合 service | 1.5 天 |
| Founder Dashboard 前端 | 2 天 |
| 顾问工作台前端 | 0.5 天 |
| Customer 新字段迁移 + 结案登记 API | 1 天 |
| 结案登记 UI(列表卡片 + 详情 Modal) | 1 天 |
| 未分配线索页 /admin/leads | 1 天 |
| 测试 + 手工回归 + PROGRESS.md 更新 | 1 天 |
| **小计** | **11-12 天** |

---

## 12. 开放问题(待 review 时讨论)

1. **API 双写过渡期长度**:定为 2 周,到期清理。是否太短或太长? **倾向 2 周**(上线后观察一轮,有问题也能拉长。)
2. **Dashboard 刷新机制**:页面打开时请求一次。是否需要"刷新"按钮或自动轮询? **倾向:加一个手动"刷新"按钮,不做自动轮询。**
3. **结案登记"方案摘要"存哪**:存到 Customer.notes(追加) vs 要不要新增 `solution_summary` 字段? **倾向:M2 存 notes,未来要做案例库联动时再考虑独立字段。**
4. **未分配线索**默认排序:按 `intent_level` 降序 还是 `created_at` 升序(老线索先分)? **倾向 intent_level 降序**(高意向优先处理。)
5. **`ConsultantWorkbench` 的"待跟进"定义**:`next_follow_up_at <= now + 24h` 还是 `next_follow_up_at.date() == today`? **倾向 `<= now + 24h`,动态滑窗更准。**
6. **FounderOverview 的权限使用量**:是否区分"谁使用了"? **倾向:M2 只看总量,不拆按顾问。拆到 M3 或 backlog。**

---

## 13. 对未来 C 端项目的契约承诺

M2 上线后,未来 C 端独立项目**只需做前端**,后端不再改动即可接入:
- ✅ 认证:`POST /api/v1/auth/login` 返回 JWT
- ✅ 用户自视角:`GET /api/v1/me/*` 家族
- ✅ 征信/流水/诊断 service 复用
- ✅ 权限模型:通过 `effective_capabilities` 判定前端菜单(C 端用户 role=c_end,默认集 = {dashboard, credit_analysis, loan_calculator})
- ✅ 文档:`docs/API.md` 是唯一 source of truth
- ⚠️ 未完成(由 C 端项目自己做):付费解锁流程、注册流程、"申请融资"建 Lead 的业务逻辑
