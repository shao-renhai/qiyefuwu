# 云上融 项目总进度看板

> 维护目的:防止丢失开发进度。每推进一个 commit 更新,任何人(含 AI 工作者)接手项目时,先读这份看板。
>
> **阅读顺序:** 先看"当前焦点"→ 再看"模块状态总览" → 需要细节时跳到对应 spec/plan 文件。

---

## 当前焦点(Current Focus)

**阶段:** M1 + M2 两份 spec 已写完,**M1 已通过用户 review,M2 待 review**
**分支:** `claude/permission-founder-admin` (已 push 到 GitHub)
**下一步:** M2 spec 审阅通过后 → 调用 writing-plans 写实现计划 → subagent-driven 实现

---

## 模块状态总览

| 模块 | Spec | Plan | 实现 | 上线 | 备注 |
|---|---|---|---|---|---|
| 客户管理 + 案例库 MVP | — | — | ✅ | ✅ `95e6e49` | 早期基础功能 |
| 征信分析 v1 | — | — | ✅ | ✅ `0136617` `bd8abb1` | 查询记录简化 + 逾期记录 B 方案 |
| 流水分析 v1 | — | — | ✅ | ✅ `149e87d` | 多账户合并+三大比率+诊断报告 |
| **流水分析 v2**(银行年化重构) | ✅ [spec](superpowers/specs/2026-04-18-bank-annual-revenue-refactor-design.md) | ✅ [plan](superpowers/plans/2026-04-18-bank-annual-revenue-refactor.md) | ✅ 31/31 tests pass | ✅ `adfad67` @ 2026-04-19 | 年度收入框架 + 银企覆盖率反转 + UI banner |
| **M1 权限引擎 + Founder 后台 V1** | ✅ [spec](superpowers/specs/2026-04-19-m1-permission-and-founder-admin-design.md) | ⏳ | ⏳ | ⏳ | 等用户 review |
| **M2 Founder Dashboard + API 规范化** | ✅ [spec](superpowers/specs/2026-04-19-m2-dashboard-and-api-normalization-design.md) | ⏳ | ⏳ | ⏳ | 等用户 review |
| 现金流健康诊断 | ✅ [spec](superpowers/specs/2026-04-18-cashflow-health-diagnosis-design.md) | ⏳ | ⏳ | ⏳ | 已有 spec,plan 待 M1/M2 完成后排入 |

---

## 已推迟清单(Backlog / Deferred)

> 明确决定**暂不实现**的需求,记录在此防遗忘。

- **C 端独立产品** — 未来独立网站项目,通过调 B 端 API 接入征信/流水/方案等能力
  - C 端 shell / 注册流 / 自助页面
  - 订阅付费解锁机制(capability `source=subscription` + `expires_at`)
  - 征信分析付费高级版
  - C 端 → 意向池"申请融资"通道
- **公开引流表单** — 已有登录页引流入口,暂不新增
- **客户池自动分配** — M2 手动分配先做,自动轮询/按区域规则做为 backlog
- **支付接入**(Stripe/支付宝)— 等 C 端项目

---

## 生产部署

- **当前线上 commit:** `adfad67`(流水分析 v2 已上线 2026-04-19)
- **服务器:** `101.96.197.130`,项目路径 `/opt/qiyefuwu`
- **服务管理:** `systemctl restart qiyefuwu`
- **前端发布:** `cd /opt/qiyefuwu/frontend && npm ci && npm run build`(dist 直接由 nginx 提供)
- **备份:** `/root/finance.db.backup-*`,`/root/frontend-dist.backup-*`

---

## 文件地图

```
docs/
├── PROGRESS.md                               ← 你在这
├── TECHNICAL.md                              ← 技术栈参考
└── superpowers/
    ├── specs/                                ← 设计文档(架构/字段/API)
    │   ├── 2026-04-18-bank-annual-revenue-refactor-design.md
    │   ├── 2026-04-18-cashflow-health-diagnosis-design.md
    │   ├── 2026-04-19-m1-permission-and-founder-admin-design.md  (撰写中)
    │   └── 2026-04-19-m2-dashboard-and-api-normalization-design.md  (待写)
    └── plans/                                ← 实现计划(checkbox 步骤)
        └── 2026-04-18-bank-annual-revenue-refactor.md
```

---

## 更新规则

- 每个 module 的 spec 产出时 → 勾 "Spec ✅" + 链接
- 每个 module 的 plan 产出时 → 勾 "Plan ✅" + 链接
- 每批 commit 上线 → 勾 "上线 ✅" + 最新 commit hash 和日期
- 当前焦点变更时 → 顶部"当前焦点"section 直接替换
- 推迟的需求 → 放进"已推迟清单",说明原因
