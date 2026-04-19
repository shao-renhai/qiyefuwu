# M1: 权限引擎 + Founder 后台 V1 设计文档

> **日期:** 2026-04-19
> **范围:** 里程碑 M1(约 2 周,独立可上线)
> **依赖:** 无
> **后续里程碑:** M2(Dashboard + API 规范化)、未来 C 端独立项目

---

## 1. 目标

把现在**硬编码的 3 级角色系统**升级为 **Role + Capability 混合模型**,并交付一个 **Founder 能用的后台管理 V1**(用户列表、角色切换、capability 勾选)。上线后:

- 顾问账号分"初级/专属"两档,权限差异化
- Founder 能在 UI 里单独给某个初级顾问"发一张流水分析牌"(capability 粒度控制)
- 菜单权限全部由 `has_capability()` 驱动,不再散落硬编码
- C 端角色的枚举值 `c_end` **预留**,数据库可入但前端不渲染,为未来独立 C 端项目铺路
- 历史的"客户"模块改名"客户池",修复"意向池→详情→列表看不到"的语义错配

---

## 2. 不在范围内(明确推迟)

| 推迟事项 | 原因 | 去向 |
|---|---|---|
| C 端独立 shell、注册、登录 | 战略决策:B 端优先 | 未来独立 C 端项目 |
| 订阅付费接入 | 无需在 M1 处理 | capability `source` 字段**预埋**,付费流程未来做 |
| Founder 数据可视化 Dashboard | 范围拆分 | M2 |
| API 版本化 `/v1` 前缀、OpenAPI 规范化 | 范围拆分 | M2 |
| 客户池自动分配规则 | 范围拆分 | M2 |
| 客户阶段高级展示(已放款/已拒绝卡片) | 范围拆分 | M2 |

---

## 3. 架构总览

```
┌────────────────────────── 前端 ──────────────────────────┐
│ App.tsx                                                 │
│   └─ 菜单过滤: item.capability ∈ user.effective_caps     │
│ 新增页面:                                                 │
│   └─ /admin/users      用户列表                          │
│   └─ /admin/users/:id  用户详情(角色切换 + capability 勾选)│
└─────────────────────────────────────────────────────────┘
                           ↓ JWT + /api/me 返回 role+caps
┌────────────────────────── 后端 ──────────────────────────┐
│ services/capabilities.py   ◄── 新增:权限引擎              │
│   ├─ ROLE_DEFAULT_CAPS: dict[Role, set[str]]            │
│   ├─ has_capability(user, feature_key) → bool           │
│   └─ effective_capabilities(user) → set[str]            │
│                                                         │
│ services/permissions.py    ◄── 保留+扩展                  │
│   ├─ require_role(roles)              向后兼容           │
│   └─ require_capability(feature_key)  新增               │
│                                                         │
│ routers/admin.py           ◄── 新增:founder 后台 API      │
│   ├─ GET    /api/admin/users                            │
│   ├─ GET    /api/admin/users/{id}                       │
│   ├─ PATCH  /api/admin/users/{id}/role                  │
│   ├─ PUT    /api/admin/users/{id}/capabilities          │
│   └─ GET    /api/admin/capabilities       (可用 key 清单) │
│                                                         │
│ routers/auth.py            ◄── 修改                       │
│   └─ /api/me 返回 role + effective_capabilities         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌───────────────────── DB(SQLite) ──────────────────────┐
│ users                      ◄── 修改 role 枚举           │
│   role VARCHAR  新枚举值: founder / senior_consultant /│
│                 junior_consultant / c_end(预留)        │
│ user_capabilities          ◄── 新增表                   │
│   id, user_id, feature_key, source, granted_by,        │
│   granted_at, expires_at(NULLABLE), revoked_at         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 数据模型变更

### 4.1 `User.role` 枚举迁移

**旧值 → 新值:**
| 旧 | 新 | 说明 |
|---|---|---|
| `founder` | `founder` | 不变 |
| `consultant` | `senior_consultant` | 默认按**最大权限**降级,避免业务中断 |
| `telesales` | `junior_consultant` | 合并 |
| — | `c_end` | 新增,**预留不激活**(M1 不允许创建,但枚举中存在不报错) |

**迁移脚本:** `backend/scripts/migrate_roles_m1.py`
- 幂等:重复运行不出错
- 输出:旧值→新值分布统计
- 无 c_end 用户被创建(仅更新枚举常量)
- 回滚脚本(`migrate_roles_m1_rollback.py`)可逆

### 4.2 新增 `user_capabilities` 表

```python
class UserCapability(Base):
    __tablename__ = "user_capabilities"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False)
    # 'role_default' | 'manual_grant' | 'subscription'
    source = Column(String, nullable=False, default="manual_grant")
    granted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # NULL = 永久
    revoked_at = Column(DateTime, nullable=True)  # 软删除

    __table_args__ = (
        UniqueConstraint("user_id", "feature_key", "source", name="uq_user_capability"),
    )
```

**设计约束:**
- `source='role_default'` 的记录**不落库**,只在 `effective_capabilities()` 运行时由 role 推导出——避免 role 改变时要同步维护成百上千条冗余
- `source='manual_grant'` 是 founder 在后台手动发牌,落库
- `source='subscription'` 是未来付费来源,M1 不写入但 schema 预留
- `expires_at IS NOT NULL` 表示有过期时间;后端查询时过滤已过期的记录
- `revoked_at IS NOT NULL` 表示已撤销

### 4.3 Capability Key 清单(M1 范围)

| feature_key | 中文 | 默认归属 role |
|---|---|---|
| `dashboard` | 工作台 | 全员(登录即有) |
| `lead_pool` | 意向池 | junior_consultant, senior_consultant, founder |
| `customer_pool` | 客户池(原"客户") | junior_consultant, senior_consultant, founder |
| `case_library` | 客户案例 | senior_consultant, founder |
| `credit_analysis` | 征信分析 | **全员**(含未来 c_end) |
| `bank_analysis` | 流水分析 | senior_consultant, founder |
| `loan_calculator` | 贷款计算器 | **全员**(含未来 c_end) |
| `diagnostic` | 融资诊断 | senior_consultant, founder |
| `admin_console` | 系统管理 | founder |

**Role 默认集(源码常量 `ROLE_DEFAULT_CAPS`):**
```python
ROLE_DEFAULT_CAPS: dict[str, set[str]] = {
    "founder": {"dashboard", "lead_pool", "customer_pool", "case_library",
                "credit_analysis", "bank_analysis", "loan_calculator",
                "diagnostic", "admin_console"},
    "senior_consultant": {"dashboard", "lead_pool", "customer_pool",
                          "case_library", "credit_analysis", "bank_analysis",
                          "loan_calculator", "diagnostic"},
    "junior_consultant": {"dashboard", "lead_pool", "customer_pool",
                          "credit_analysis", "loan_calculator"},
    "c_end": {"dashboard", "credit_analysis", "loan_calculator"},  # 预留不激活
}
```

---

## 5. 权限引擎(`services/capabilities.py`)

```python
def effective_capabilities(user: User, db: Session) -> set[str]:
    """计算用户实际生效的 capability 集合 = role 默认集 ∪ 未过期未撤销的 grants"""
    now = datetime.utcnow()
    role_caps = ROLE_DEFAULT_CAPS.get(user.role or "junior_consultant", set())
    grants = db.query(UserCapability).filter(
        UserCapability.user_id == user.id,
        UserCapability.revoked_at.is_(None),
        or_(UserCapability.expires_at.is_(None),
            UserCapability.expires_at > now),
    ).all()
    grant_caps = {g.feature_key for g in grants}
    return role_caps | grant_caps


def has_capability(user: User, feature_key: str, db: Session) -> bool:
    return feature_key in effective_capabilities(user, db)
```

### 5.1 后端使用方式

**`require_capability` 依赖项:**
```python
def require_capability(feature_key: str):
    def _dep(current_user: User = Depends(get_current_user),
             db: Session = Depends(get_db)) -> User:
        if not has_capability(current_user, feature_key, db):
            raise HTTPException(403, detail=f"缺少权限: {feature_key}")
        return current_user
    return _dep
```

**使用示例:**
```python
@router.post("/bank-statements")
def upload(user: User = Depends(require_capability("bank_analysis"))): ...
```

### 5.2 `require_role` 的向后兼容策略

现有路由(customers.py / cases.py)大量使用 `require_role("founder")` 或 `role == "founder"` 判断。

**M1 策略:**
- `require_role` 函数本身**保留**,内部改为调 `has_capability` 查"对应 role 的默认 capability"
- 代码里所有 `require_role("founder")` 改为 `require_capability("admin_console")`(语义更准)
- 代码里 `role == "telesales"` → `not has_capability(user, "customer_pool")` 或相当的 capability 判断
- `role == "consultant"` 等硬编码改为基于 capability 判断,**禁止引入新的 role 字符串硬编码**

**一次性清理**:用 grep 定位所有 `user.role` / `role ==` / `require_role(...)` 引用,逐个改成 capability 判断,写在 M1 plan 里。

---

## 6. 后端 API 变更

### 6.1 修改 `/api/auth/me`
返回体增加 `effective_capabilities`:
```json
{
  "id": 3,
  "username": "zhangsan",
  "display_name": "张三",
  "role": "junior_consultant",
  "effective_capabilities": ["dashboard", "lead_pool", "customer_pool",
                              "credit_analysis", "loan_calculator"]
}
```

### 6.2 新增 `routers/admin.py`(仅 founder 可访问)

所有路由都 `Depends(require_capability("admin_console"))`。

#### `GET /api/admin/users`
查询参数: `q`(用户名模糊搜)、`role`(过滤)、`page`、`page_size`
返回:
```json
{
  "total": 15,
  "users": [
    {"id": 3, "username": "zhangsan", "display_name": "张三",
     "role": "junior_consultant", "is_active": true,
     "extra_grants": ["bank_analysis"],
     "created_at": "2026-01-15T10:00:00"}
  ]
}
```
`extra_grants` = 该用户所有非 role_default 且未过期未撤销的 grant `feature_key` 列表。

#### `GET /api/admin/users/{id}`
完整用户详情 + 完整 capabilities 列表(含 source/granted_at/expires_at/revoked_at)。

#### `PATCH /api/admin/users/{id}/role`
请求体: `{"role": "senior_consultant"}`
- 校验 role 是合法值
- 不允许把自己降级(防止误操作失去 admin 权限)
- 不允许修改 `c_end` 角色(M1 暂不支持)
- 更新 `User.role`,返回新的 `effective_capabilities`

#### `PUT /api/admin/users/{id}/capabilities`
请求体:
```json
{
  "grants": [
    {"feature_key": "bank_analysis", "expires_at": null},
    {"feature_key": "case_library", "expires_at": "2026-12-31T23:59:59"}
  ]
}
```
语义: **全量替换**该用户所有 `source='manual_grant'` 的记录。旧的设为 `revoked_at=now`,新的插入。
- `role_default` 来源的记录不受影响(不在表里)
- `subscription` 来源的记录不受影响(M1 还没有)

#### `GET /api/admin/capabilities`
返回所有 capability key 清单 + 中文名 + 哪些 role 默认包含,供前端勾选 UI 渲染。

### 6.3 数据迁移 endpoint(一次性)

迁移通过脚本运行,**不暴露为 HTTP 接口**。

---

## 7. 前端改造

### 7.1 菜单从 `roles` 改 `capability` 驱动

`App.tsx` 菜单项结构改为:
```ts
type AppMenuItem = NonNullable<MenuProps['items']>[number] & {
  capability?: string;  // 替代原先的 roles[]
};
```

`menuItems` 过滤逻辑:
```ts
const caps = new Set(user?.effective_capabilities ?? []);
const visible = all.filter(it => !it.capability || caps.has(it.capability));
```

**菜单项映射:**
| label | key | capability |
|---|---|---|
| 工作台 | dashboard | dashboard |
| 意向池 | leads | lead_pool |
| 客户池 | customers(键保留,label 改"客户池") | customer_pool |
| 客户案例 | cases | case_library |
| 征信分析 | credit | credit_analysis |
| 流水分析 | bank | bank_analysis |
| 贷款计算器 | calculator | loan_calculator |
| 融资诊断 | diagnostic | diagnostic |
| **系统管理** | admin | admin_console |

### 7.2 客户池 UI 修复

**Bug 背景:** 意向池点"详情" → 跳 `#/customers/:id`,但"客户"菜单默认过滤 `stage != 'lead'`,所以列表里看不到该客户,用户误以为数据丢失。

**修复方案:**
- 菜单 label 改"客户池"
- `CustomersPage` 顶部新增 `Tabs`:
  - **全部客户**(默认)— 含所有阶段(包括 lead)
  - **跟进中** — stage ∈ {invited, consulting, proposal}
  - **已成交** — stage = closed_won
  - **已拒绝** — stage = closed_lost
  - **意向(lead)** — stage = lead
- 意向池页不变,依然是独立模块

这样"从意向池跳到详情再返回客户池"时,默认 tab 就能看到。

### 7.3 新增"系统管理"页面

两个页面:

**`/admin/users`** — 用户列表
- Ant Design `Table`,列:username/显示名/角色/状态/额外授权/创建时间/操作
- 顶部搜索(按用户名)、角色过滤
- 行操作:`详情` 按钮跳 `/admin/users/:id`

**`/admin/users/:id`** — 用户详情 + 权限编辑
- 基本信息(用户名/显示名/状态开关)
- 角色切换 `Radio.Group`(founder/senior/junior,c_end 不显示)
- **Capability 勾选区**:
  - 按 capability 逐项展示
  - "来自角色默认"的项 checkbox 不可改(标灰 + tooltip)
  - 其余项 checkbox + 可选"过期时间"(DatePicker,留空 = 永久)
  - 保存按钮 → 调 `PUT /api/admin/users/{id}/capabilities`
  - 保存后显示 toast + 刷新 effective_capabilities

### 7.4 roleLabel 兼容

当前代码:
```ts
const roleLabel = role === 'founder' ? '创始人'
                : role === 'telesales' ? '电销' : '融资顾问';
```

改为:
```ts
const ROLE_LABELS = {
  founder: '创始人',
  senior_consultant: '专属顾问',
  junior_consultant: '初级顾问',
  c_end: '企业客户',  // 未来用
};
const roleLabel = ROLE_LABELS[role] ?? '用户';
```

---

## 8. 数据迁移脚本

**文件:** `backend/scripts/migrate_roles_m1.py`

**职责:**
1. 打印当前 `User.role` 分布
2. 把 `telesales` → `junior_consultant`,把 `consultant` → `senior_consultant`(逐行 UPDATE,transaction safe)
3. 打印迁移后分布
4. **幂等**:如果分布已经是新值,输出"无需迁移"并退出
5. 不触碰 `founder`

**回滚脚本:** `backend/scripts/migrate_roles_m1_rollback.py`
反向:`junior_consultant` → `telesales`,`senior_consultant` → `consultant`。

**运行时机:** M1 代码上线**之前**执行(先迁数据,再重启后端)。
**执行记录:** 运行结果追加到 `docs/PROGRESS.md` 的"生产部署"章节。

---

## 9. 测试策略

### 9.1 单元测试 `backend/tests/`
- `test_capabilities.py`:
  - `ROLE_DEFAULT_CAPS` 完整性(9 个 capability key 都能被某个 role 覆盖)
  - `effective_capabilities()` 对每个 role 返回正确默认集
  - `has_capability()` 在 role_default / manual_grant / subscription 三种来源都能正确判定
  - `expires_at` 过期后 capability 不再生效
  - `revoked_at` 设置后 capability 不再生效
- `test_permissions.py`(扩展):
  - `require_capability` 成功通过与 403 拒绝
- `test_admin_routes.py`:
  - 非 founder 访问 `/api/admin/*` 返 403
  - `PATCH /role` 不允许自我降级
  - `PUT /capabilities` 替换语义正确(旧 grant revoked,新 grant inserted)
  - `PATCH /role` 到非法 role 返 400
  - `PATCH /role` 到 `c_end` 返 400(M1 禁用)

### 9.2 迁移脚本测试
- `test_migrate_roles_m1.py`:
  - 初始数据:混合 founder/consultant/telesales → 预期结果
  - 已迁移数据再次运行:无变化
  - 回滚脚本:数据可逆
  - 迁移时数据库中无违反 UNIQUE 约束的情况

### 9.3 集成测试
- `test_integration_auth.py`: 登录后 `/api/me` 返回 `effective_capabilities`
- 手工测试清单(跑在联调阶段):
  1. Founder 登录 → 看到"系统管理"菜单
  2. junior_consultant 登录 → 菜单只见工作台/意向池/客户池/征信分析/贷款计算器
  3. Founder 后台给 junior 发一张 `bank_analysis` 牌 → junior 下次刷新看得见"流水分析"菜单
  4. 撤销这张牌 → 下次刷新菜单消失
  5. 给一张带 expires_at=1 分钟后的牌 → 1 分钟后菜单消失(通过 `/api/me` 验证)
  6. 意向池点"详情" → 返回后在客户池"全部"tab 能看到该客户(bug 修复)

---

## 10. 交付验收清单

M1 完成必须同时满足以下:

- [ ] 所有后端单元/集成测试通过(`pytest` 全绿,**0 失败**)
- [ ] 迁移脚本 dry-run 正常,对生产 DB 跑过,`User.role` 分布正确
- [ ] `/api/me` 返回体包含 `effective_capabilities` 字段
- [ ] Founder 在 `/admin/users` UI 能看到用户列表
- [ ] Founder 能在 `/admin/users/:id` 改 role 并立即在该用户下次登录后生效
- [ ] Founder 能 grant/revoke 单项 capability,并支持 expires_at
- [ ] 前端菜单对 junior_consultant / senior_consultant / founder **三角色**均符合权限矩阵
- [ ] 客户池(原客户模块)的 label 和 tabs 都已更新,从意向池跳详情返回列表能看到
- [ ] `require_role` / `role ==` 的硬编码在主业务路由(customers/cases)里**完全清除**(只保留在迁移脚本中)
- [ ] `docs/PROGRESS.md` M1 行勾为"上线 ✅ + commit hash"

---

## 11. 风险与回滚

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 迁移脚本改错 role 导致顾问无法登录 | 低 | 高 | 上线前**必须**备份 `finance.db`;迁移后验证 `/api/me`;失败时直接恢复备份 |
| `require_capability` 误拦正常请求 | 中 | 中 | 集成测试覆盖所有核心路由;灰度:先给 founder 账号试用 30 分钟再全量 |
| 前端菜单误隐藏导致用户抱怨 | 中 | 低 | 每个 role 的预期菜单在 QA 清单明列;用户可退回旧 UI(git revert 就是 backup) |
| user_capabilities 表设计以后不够灵活 | 低 | 中 | `source` 字段可扩展;`expires_at` 预留付费场景 |
| founder 意外把自己降级 | 低 | 高 | `PATCH /role` 拒绝自我降级 + 前端禁止自改 role |

**回滚预案:**
- M1 上线出问题 → `git revert <merge-commit>` + `python scripts/migrate_roles_m1_rollback.py` + restart
- `user_capabilities` 表保留不删(数据无害),下次上线复用

---

## 12. 工期预估

| 任务组 | 估时 |
|---|---|
| 数据模型 + 迁移脚本 + 权限引擎(后端核心) | 2-3 天 |
| `require_capability` 改造 + 硬编码清理 | 1-2 天 |
| Founder 后台 API(admin 路由) | 1-2 天 |
| 前端菜单 capability 驱动 + roleLabel | 0.5 天 |
| 客户池 UI 修复(tab 切换) | 0.5 天 |
| 前端 `/admin/users` 列表页 + 详情页 | 2-3 天 |
| 集成测试 + 手工测试清单 + 文档 | 1 天 |
| **小计** | **8-12 天** |

---

## 13. 开放问题(待 review 时讨论)

1. **junior 如何升 senior:** founder 在 `/admin/users/:id` 改 role 即升级。是否需要额外审批流?**倾向:不需要,founder 一人决策,要审批就太重。**
2. **Capability 过期后是否通知用户:** 例如付费过期。M1 暂不实现通知,仅让菜单自然消失。**倾向:可接受。**
3. **访问日志:** 是否需要记录 founder 修改 role/capability 的审计日志(who changed whom, when)? **倾向:M1 简单记到 granted_by_id + granted_at,不单独建 audit_log 表。**
4. **客户池 tab 默认展示:** "全部"还是"跟进中"作为默认 tab? **倾向:"全部"——修复 bug 语义。**
