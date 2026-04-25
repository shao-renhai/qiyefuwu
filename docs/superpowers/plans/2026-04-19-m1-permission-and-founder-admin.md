# M1 权限引擎 + Founder 后台 V1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把硬编码 3 级角色系统升级为 Role + Capability 混合模型,并交付 Founder 能用的后台管理 V1(用户列表 / 角色切换 / capability 勾选)。

**Architecture:** 后端新增 `services/capabilities.py` 权限引擎(ROLE_DEFAULT_CAPS 常量 + 运行时推导) + `user_capabilities` 表存储 manual_grant;扩展 `services/permissions.py` 添加 `require_capability` 依赖;新增 `routers/admin.py`;前端菜单从 `roles[]` 改为 `capability` 字符串驱动;新增 `/admin/users` 列表与详情页。

**Tech Stack:** FastAPI + SQLAlchemy(SQLite) + Pydantic v2 + React 19 + TypeScript + Ant Design 5 + Vite。

**设计文档:** [docs/superpowers/specs/2026-04-19-m1-permission-and-founder-admin-design.md](../specs/2026-04-19-m1-permission-and-founder-admin-design.md)

---

## 文件地图

**Task 0(定位与对外标签):**
- `backend/services/labels.py` → 新建:对外标签单一数据源(`DIAGNOSIS_LABELS`、`CASE_LABELS`、`DISCLAIMERS`)
- `backend/tests/test_labels.py` → 新建:标签覆盖率与禁用词测试
- `frontend/src/constants/labels.ts` → 新建:前端展示标签字典
- `backend/db/database.py` → 在 `DiagnosisRecord`、`Customer`、`Case` 类 docstring 增加业务定位声明(修改)
- `backend/CLAUDE.md` → 顶部加"业务定位"段并引用 `docs/POSITIONING.md`(修改)
- `README.md`(项目根)→ 同上(修改,若不存在则跳过)

**后端新建:**
- `backend/db/database.py` → 新增 `UserCapability` 模型(修改)
- `backend/services/capabilities.py` → 新建:`ROLE_DEFAULT_CAPS`、`has_capability`、`effective_capabilities`、capability 清单
- `backend/services/permissions.py` → 扩展:新增 `require_capability`(修改)
- `backend/routers/admin.py` → 新建:`/api/admin/users` 等 5 条路由
- `backend/scripts/migrate_roles_m1.py` → 新建:一次性 role 枚举迁移(可幂等)
- `backend/scripts/migrate_roles_m1_rollback.py` → 新建:回滚脚本
- `backend/main.py` → 注册 admin router(修改)

**后端测试新建:**
- `backend/tests/test_capabilities.py`
- `backend/tests/test_admin_routes.py`
- `backend/tests/test_migrate_roles_m1.py`
- `backend/tests/test_permissions.py` → 追加 `require_capability` 测试(修改)
- `backend/tests/conftest.py` → 更新 role fixtures 用新 role 名(修改)

**后端业务路由修改(硬编码清理):**
- `backend/routers/customers.py` → 清理 `role ==` / `require_role` → 改 capability(修改)
- `backend/routers/cases.py` → 清理 `role ==` / `require_role` → 改 capability(修改)
- `backend/routers/auth.py` → `/me` 返回 `effective_capabilities`(修改)

**前端新建:**
- `frontend/src/pages/AdminUsers.tsx` → 用户列表页
- `frontend/src/pages/AdminUserDetail.tsx` → 用户详情 + 权限编辑页
- `frontend/src/services/adminApi.ts` → 封装 `/api/admin/*` 调用

**前端修改:**
- `frontend/src/services/api.ts` → `AuthUser` / `TokenResponse` 增加 `effective_capabilities`;登录后拉取 `/me` 刷新
- `frontend/src/App.tsx` → 菜单 capability 驱动;加"系统管理";roleLabel 映射;hash 路由支持 `/admin/*`
- `frontend/src/pages/Customers.tsx` → 顶部 Tabs(全部/跟进中/已成交/已拒绝/意向)

---

## 任务依赖图

```
0  (POSITIONING.md + 中央化标签 + docstring)  ← 所有 Task 的前置
  └─ 1  (UserCapability 模型)
       └─ 3  (capabilities.py 引擎)
            └─ 4  (require_capability 依赖)
                 └─ 5  (/me 扩展)
                 └─ 6,7 (admin 路由)
                      └─ 8 (注册 router + fixture)
                           └─ 9,10 (硬编码清理)
2  (迁移脚本)  ─ 并行,上线前跑

11 (前端 api 类型) ← 依赖 5
12 (App.tsx 菜单) ← 依赖 11
13 (Customers tabs) ← 独立
14,15 (admin 页面) ← 依赖 11
16 (路由拼装) ← 依赖 12,14,15
17 (手工验收 + PROGRESS)
```

---

## Task 0: 业务定位话术审查与中央化标签

**目标:** 建立"业务定位 → 代码标签 → 对外文案"的单一数据源,
在 M1 主体开发前完成话术对齐,避免后续每个 router/页面各自命名造成不一致。

**前置依赖:** `docs/POSITIONING.md` 已存在并通过创始人 review。

**Files:**
- Create: `backend/services/labels.py`
- Create: `frontend/src/constants/labels.ts`
- Create: `backend/tests/test_labels.py`
- Modify: `backend/db/database.py`(在 `DiagnosisRecord`、`Customer`、`Case` 类的 docstring 添加定位声明)
- Modify: `backend/CLAUDE.md`(顶部加"业务定位"段,引用 POSITIONING.md)
- Modify: `README.md`(项目根,同上;若不存在则跳过)

- [ ] **Step 1: 写失败的标签覆盖率测试**

`backend/tests/test_labels.py`(新建):

```python
"""对外标签覆盖与禁用词测试。"""
from pathlib import Path


# 禁用词:这些词不应出现在 labels.py / 前端标签 / 用户协议
FORBIDDEN_TERMS = [
    "信用评分",
    "智能诊断",
    "推荐银行",
    "评估额度",
    "撮合贷款",
    "我们能贷",
]


def test_label_dict_covers_all_score_fields():
    """labels.py 中必须为 DiagnosisRecord 的评分与额度字段提供对外标签。"""
    from services.labels import DIAGNOSIS_LABELS

    required = [
        "score_credit", "score_cashflow", "score_structure",
        "score_collateral", "score_intent", "score_total",
        "loan_min", "loan_max",
    ]
    for key in required:
        assert key in DIAGNOSIS_LABELS, f"missing label for {key}"
        label = DIAGNOSIS_LABELS[key]
        # 评分字段必须显式说明是"完整度/诊断/参考/配合度",
        # 不能裸写"信用评分"
        assert any(word in label for word in ["完整度", "诊断", "配合度", "参考"]), \
            f"{key} label '{label}' must clarify it's not credit score"


def test_no_forbidden_terms_in_label_dict():
    """labels.py 不能含禁用词。"""
    from services import labels
    src = Path(labels.__file__).read_text(encoding="utf-8")
    for term in FORBIDDEN_TERMS:
        assert term not in src, f"forbidden term '{term}' in labels.py"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_labels.py -v`
Expected: FAIL("ModuleNotFoundError: No module named 'services.labels'")

- [ ] **Step 3: 实现 `backend/services/labels.py`**

```python
"""对外标签的单一数据源。

所有 API 响应中给前端/客户看的字段名,统一从这里取。
背景:本平台是融资顾问 SaaS 工具,不是征信/放贷机构,
所有"评分"均为顾问内部诊断,不构成对客户的信用评估。
详见 docs/POSITIONING.md。
"""

DIAGNOSIS_LABELS = {
    "score_credit":     "征信资料完整度",
    "score_cashflow":   "现金流资料完整度",
    "score_structure":  "公司结构资料完整度",
    "score_collateral": "抵押资料完整度",
    "score_intent":     "客户配合度评估",
    "score_total":      "顾问诊断综合分",
    "loan_min":         "顾问参考区间下限",
    "loan_max":         "顾问参考区间上限",
}

CASE_LABELS = {
    "recommended_bank": "案例对接银行(历史记录)",
    "approved_amount":  "案例实际批复(历史记录)",
}

DISCLAIMERS = {
    "diagnosis": "本评分为顾问内部资料整理诊断,非客户信用评估,不构成贷款承诺。",
    "case":     "案例库展示历史案例供顾问参考,不代表当前客户可获相同结果。",
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && pytest tests/test_labels.py -v`
Expected: PASS(2 passed)

- [ ] **Step 5: 实现前端 `frontend/src/constants/labels.ts`**

```typescript
// 对外展示标签的单一数据源
// 详见 docs/POSITIONING.md

export const DIAGNOSIS_LABELS: Record<string, string> = {
  score_credit:     "征信资料完整度",
  score_cashflow:   "现金流资料完整度",
  score_structure:  "公司结构资料完整度",
  score_collateral: "抵押资料完整度",
  score_intent:     "客户配合度评估",
  score_total:      "顾问诊断综合分",
  loan_min:         "顾问参考区间下限",
  loan_max:         "顾问参考区间上限",
};

export const DISCLAIMERS = {
  diagnosis: "本评分为顾问内部资料整理诊断,非客户信用评估,不构成贷款承诺。",
  case:      "案例库展示历史案例供顾问参考,不代表当前客户可获相同结果。",
};
```

- [ ] **Step 6: 在关键模型 docstring 加定位声明**

修改 `backend/db/database.py` 中三个类的 docstring(类定义的第一行 docstring):

```python
class DiagnosisRecord(Base):
    """
    顾问诊断记录。

    业务定位:本表存储的所有 score_* 字段为顾问内部资料完整度
    与配合度的工作记录,不是对客户的信用评分,不对外作为信用评估
    输出。loan_min/loan_max 为顾问录入的参考区间,非系统计算。
    详见 docs/POSITIONING.md。
    """
    __tablename__ = "diagnosis_records"
    # ... 字段不变
```

```python
class Customer(Base):
    """
    客户主档。

    业务定位:本表客户为顾问公司的咨询服务对象,平台为数据处理者
    (processor),顾问公司为数据控制者(controller)。征信/流水
    数据上传须附顾问与客户签署的授权书。详见 docs/POSITIONING.md。
    """
```

```python
class Case(Base):
    """
    案例库:顾问历史案例记录,用于工作经验积累与参考。

    业务定位:案例库展示历史案例,不构成对当前客户的融资建议或承诺。
    `recommended_bank` 字段记录案例中**实际**对接过的银行,非系统推荐。
    详见 docs/POSITIONING.md。
    """
```

- [ ] **Step 7: 更新 CLAUDE.md 与 README.md**

在 `backend/CLAUDE.md` 文件**顶部**(第一个 `##` 之前)插入:

```markdown
## 业务定位

本项目为融资顾问公司提供数字化作业系统(B2B SaaS),不开展征信、
撮合、放贷业务。所有命名、API 字段、对外文案须遵守
[docs/POSITIONING.md](../docs/POSITIONING.md) 的边界声明。

---
```

在项目根 `README.md` 顶部加同样的段落(若 `README.md` 不存在则跳过本子步骤)。

- [ ] **Step 8: 验证禁用词清理**

Run:
```bash
cd backend && grep -rE "信用评分|智能诊断|推荐银行|评估额度" services routers --include="*.py" | grep -v "labels.py" | grep -v "^[^:]*:\s*#"
```

Expected: 无输出(禁用词只允许出现在 labels.py 的注释或 docstring)。
若有命中,逐个评估是否需要替换或加注释说明。

- [ ] **Step 9: 提交**

```bash
git add backend/services/labels.py frontend/src/constants/labels.ts \
        backend/tests/test_labels.py backend/db/database.py \
        backend/CLAUDE.md
# README.md 若已修改也加入
test -f README.md && git add README.md
git commit -m "feat(M1-task0): centralize external labels and positioning

- add backend/services/labels.py and frontend labels.ts as single
  source of truth for user-facing field names
- add positioning docstrings to DiagnosisRecord/Customer/Case
- reference docs/POSITIONING.md from CLAUDE.md (and README.md if exists)
- add label coverage and forbidden-term tests"
```

---

**完成标准:**
- `pytest backend/tests/test_labels.py -v` 全部通过
- Step 8 的 grep 命令无输出(或所有命中已加说明注释)
- `docs/POSITIONING.md` 已被 `backend/CLAUDE.md` 与三个模型 docstring 引用
- 前端 `labels.ts` 与后端 `labels.py` 字段保持一致

---

## Task 1: `UserCapability` 数据模型

**目标:** 新增 `user_capabilities` 表,用于存储所有非 role_default 的 capability 授权。

**Files:**
- Modify: `backend/db/database.py`(在 `Customer` 之前,`User` 附近加一块新模型)
- Test: `backend/tests/test_capabilities.py`(新建,含本任务的模型测试)

- [ ] **Step 1: 写失败的模型测试**

`backend/tests/test_capabilities.py`(新建):

```python
"""capability 引擎与 UserCapability 模型测试。"""
from datetime import datetime, timedelta
import pytest


def test_user_capability_model_create(api_client):
    """UserCapability 可以插入、查询、唯一约束生效。"""
    from db.database import SessionLocal, User, UserCapability

    db = SessionLocal()
    u = User(username="t1", hashed_password="x", display_name="T1", role="junior_consultant")
    db.add(u)
    db.commit()
    db.refresh(u)

    cap = UserCapability(
        user_id=u.id,
        feature_key="bank_analysis",
        source="manual_grant",
        granted_by_id=u.id,
        expires_at=None,
    )
    db.add(cap)
    db.commit()
    db.refresh(cap)

    assert cap.id is not None
    assert cap.granted_at is not None
    assert cap.revoked_at is None

    # 查询
    rows = db.query(UserCapability).filter(UserCapability.user_id == u.id).all()
    assert len(rows) == 1
    assert rows[0].feature_key == "bank_analysis"
    db.close()


def test_user_capability_unique_constraint(api_client):
    """同 (user_id, feature_key, source) 不允许重复。"""
    from sqlalchemy.exc import IntegrityError
    from db.database import SessionLocal, User, UserCapability

    db = SessionLocal()
    u = User(username="t2", hashed_password="x", display_name="T2", role="junior_consultant")
    db.add(u)
    db.commit()
    db.refresh(u)

    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis", source="manual_grant"))
    db.commit()
    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis", source="manual_grant"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_capabilities.py -v
```

Expected: FAIL(`ImportError: cannot import name 'UserCapability'`)。

- [ ] **Step 3: 在 `database.py` 添加 UserCapability 模型**

在 `backend/db/database.py` 顶部 import 里补上 `UniqueConstraint`:

```python
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, JSON, UniqueConstraint
```

在 `class User(Base)` 之后、`class Client(Base)` 之前插入:

```python
class UserCapability(Base):
    """用户 capability 授权:manual_grant/subscription 持久化;role_default 不落库。"""
    __tablename__ = "user_capabilities"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False)
    # 'manual_grant' | 'subscription'(role_default 不入库)
    source = Column(String, nullable=False, default="manual_grant")
    granted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)   # NULL = 永久
    revoked_at = Column(DateTime, nullable=True)   # NULL = 未撤销

    __table_args__ = (
        UniqueConstraint("user_id", "feature_key", "source", name="uq_user_capability"),
    )
```

- [ ] **Step 4: 运行测试,确认通过**

```bash
cd backend && pytest tests/test_capabilities.py -v
```

Expected: PASS(两条用例都绿)。

- [ ] **Step 5: 提交**

```bash
git add backend/db/database.py backend/tests/test_capabilities.py
git commit -m "feat(m1): add UserCapability model with unique constraint"
```

---

## Task 2: Role 迁移脚本(正向 + 回滚)

**目标:** 写可幂等的迁移脚本把 `consultant` → `senior_consultant`、`telesales` → `junior_consultant`,并保留回滚脚本。

**Files:**
- Create: `backend/scripts/__init__.py`(空文件,若不存在)
- Create: `backend/scripts/migrate_roles_m1.py`
- Create: `backend/scripts/migrate_roles_m1_rollback.py`
- Test: `backend/tests/test_migrate_roles_m1.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_migrate_roles_m1.py`(新建):

```python
"""迁移脚本测试:正向/幂等/回滚。"""


def _role_counts(db):
    from db.database import User
    rows = db.query(User).all()
    counts = {}
    for r in rows:
        counts[r.role] = counts.get(r.role, 0) + 1
    return counts


def test_migrate_roles_m1_forward(api_client):
    """telesales → junior_consultant,consultant → senior_consultant,founder 不变。"""
    from db.database import SessionLocal, User
    from scripts.migrate_roles_m1 import run_migration

    db = SessionLocal()
    db.add_all([
        User(username="a", hashed_password="x", role="founder"),
        User(username="b", hashed_password="x", role="consultant"),
        User(username="c", hashed_password="x", role="telesales"),
        User(username="d", hashed_password="x", role="consultant"),
    ])
    db.commit()

    stats = run_migration(db)
    db.commit()

    counts = _role_counts(db)
    assert counts.get("founder") == 1
    assert counts.get("senior_consultant") == 2
    assert counts.get("junior_consultant") == 1
    assert counts.get("consultant", 0) == 0
    assert counts.get("telesales", 0) == 0
    assert stats["updated"] == 3
    db.close()


def test_migrate_roles_m1_idempotent(api_client):
    """重复运行不报错且不改数据。"""
    from db.database import SessionLocal, User
    from scripts.migrate_roles_m1 import run_migration

    db = SessionLocal()
    db.add_all([
        User(username="a", hashed_password="x", role="senior_consultant"),
        User(username="b", hashed_password="x", role="junior_consultant"),
    ])
    db.commit()

    stats = run_migration(db)
    db.commit()
    assert stats["updated"] == 0
    db.close()


def test_migrate_roles_m1_rollback(api_client):
    """回滚:senior_consultant → consultant,junior_consultant → telesales。"""
    from db.database import SessionLocal, User
    from scripts.migrate_roles_m1_rollback import run_rollback

    db = SessionLocal()
    db.add_all([
        User(username="a", hashed_password="x", role="senior_consultant"),
        User(username="b", hashed_password="x", role="junior_consultant"),
        User(username="c", hashed_password="x", role="founder"),
    ])
    db.commit()

    stats = run_rollback(db)
    db.commit()

    counts = _role_counts(db)
    assert counts.get("consultant") == 1
    assert counts.get("telesales") == 1
    assert counts.get("founder") == 1
    assert stats["updated"] == 2
    db.close()
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_migrate_roles_m1.py -v
```

Expected: FAIL(ModuleNotFoundError: No module named 'scripts')。

- [ ] **Step 3: 创建 `scripts/` 目录骨架**

```bash
mkdir -p backend/scripts
touch backend/scripts/__init__.py
```

- [ ] **Step 4: 实现正向迁移脚本**

`backend/scripts/migrate_roles_m1.py`:

```python
"""M1 角色枚举迁移:telesales→junior_consultant, consultant→senior_consultant。

幂等:重复运行无副作用。
用法:
    python -m scripts.migrate_roles_m1
"""
from __future__ import annotations
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db.database import SessionLocal, User  # noqa: E402


ROLE_MAP = {
    "telesales": "junior_consultant",
    "consultant": "senior_consultant",
}


def run_migration(db) -> dict:
    """在给定 session 中执行迁移,返回统计信息(不 commit)。"""
    updated = 0
    for old, new in ROLE_MAP.items():
        rows = db.query(User).filter(User.role == old).all()
        for r in rows:
            r.role = new
            updated += 1
    return {"updated": updated}


def main():
    db = SessionLocal()
    try:
        # 迁移前分布
        before = {}
        for u in db.query(User).all():
            before[u.role] = before.get(u.role, 0) + 1
        print(f"迁移前 role 分布: {before}")

        stats = run_migration(db)
        db.commit()

        after = {}
        for u in db.query(User).all():
            after[u.role] = after.get(u.role, 0) + 1
        print(f"迁移后 role 分布: {after}")
        print(f"更新了 {stats['updated']} 行")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: 实现回滚脚本**

`backend/scripts/migrate_roles_m1_rollback.py`:

```python
"""M1 角色枚举回滚:senior_consultant→consultant, junior_consultant→telesales。"""
from __future__ import annotations
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db.database import SessionLocal, User  # noqa: E402


REVERSE_MAP = {
    "junior_consultant": "telesales",
    "senior_consultant": "consultant",
}


def run_rollback(db) -> dict:
    updated = 0
    for new, old in REVERSE_MAP.items():
        rows = db.query(User).filter(User.role == new).all()
        for r in rows:
            r.role = old
            updated += 1
    return {"updated": updated}


def main():
    db = SessionLocal()
    try:
        stats = run_rollback(db)
        db.commit()
        print(f"回滚 {stats['updated']} 行")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: 运行测试**

```bash
cd backend && pytest tests/test_migrate_roles_m1.py -v
```

Expected: PASS(3 条全绿)。

- [ ] **Step 7: 提交**

```bash
git add backend/scripts backend/tests/test_migrate_roles_m1.py
git commit -m "feat(m1): add role migration scripts (forward + rollback)"
```

---

## Task 3: Capability 引擎(`services/capabilities.py`)

**目标:** 实现 `ROLE_DEFAULT_CAPS` 常量、`has_capability()`、`effective_capabilities()`、`CAPABILITY_CATALOG`。

**Files:**
- Create: `backend/services/capabilities.py`
- Test: `backend/tests/test_capabilities.py`(追加)

- [ ] **Step 1: 追加失败测试**

在 `backend/tests/test_capabilities.py` 末尾追加:

```python
from datetime import datetime, timedelta


def test_role_default_caps_covers_all_keys():
    """每个 capability key 都能被至少一个 role 覆盖。"""
    from services.capabilities import ROLE_DEFAULT_CAPS, CAPABILITY_CATALOG
    all_keys = set(CAPABILITY_CATALOG.keys())
    covered = set().union(*ROLE_DEFAULT_CAPS.values())
    # admin_console 只给 founder 合理,其他 key 至少有 role 有
    missing = all_keys - covered
    assert missing == set(), f"未覆盖的 capability: {missing}"


def test_effective_capabilities_founder(api_client):
    from db.database import SessionLocal, User
    from services.capabilities import effective_capabilities
    db = SessionLocal()
    u = User(username="f", hashed_password="x", role="founder")
    db.add(u); db.commit(); db.refresh(u)
    caps = effective_capabilities(u, db)
    assert "admin_console" in caps
    assert "bank_analysis" in caps
    db.close()


def test_effective_capabilities_junior_gets_manual_grant(api_client):
    from db.database import SessionLocal, User, UserCapability
    from services.capabilities import effective_capabilities, has_capability
    db = SessionLocal()
    u = User(username="j", hashed_password="x", role="junior_consultant")
    db.add(u); db.commit(); db.refresh(u)

    # 默认 junior 不含 bank_analysis
    assert not has_capability(u, "bank_analysis", db)

    # 手动授权
    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis", source="manual_grant"))
    db.commit()

    assert has_capability(u, "bank_analysis", db)
    caps = effective_capabilities(u, db)
    assert "bank_analysis" in caps
    db.close()


def test_effective_capabilities_expires_at(api_client):
    """过期的 manual_grant 不应生效。"""
    from db.database import SessionLocal, User, UserCapability
    from services.capabilities import has_capability
    db = SessionLocal()
    u = User(username="j2", hashed_password="x", role="junior_consultant")
    db.add(u); db.commit(); db.refresh(u)

    past = datetime.utcnow() - timedelta(hours=1)
    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis",
                          source="manual_grant", expires_at=past))
    db.commit()
    assert not has_capability(u, "bank_analysis", db)
    db.close()


def test_effective_capabilities_revoked(api_client):
    """revoked_at 非空的不应生效。"""
    from db.database import SessionLocal, User, UserCapability
    from services.capabilities import has_capability
    db = SessionLocal()
    u = User(username="j3", hashed_password="x", role="junior_consultant")
    db.add(u); db.commit(); db.refresh(u)

    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis",
                          source="manual_grant", revoked_at=datetime.utcnow()))
    db.commit()
    assert not has_capability(u, "bank_analysis", db)
    db.close()


def test_has_capability_unknown_role_defaults_junior(api_client):
    """Unknown/NULL role 应按 junior_consultant 兜底。"""
    from db.database import SessionLocal, User
    from services.capabilities import has_capability
    db = SessionLocal()
    u = User(username="n", hashed_password="x", role=None)
    db.add(u); db.commit(); db.refresh(u)
    # junior_consultant 默认含 lead_pool
    assert has_capability(u, "lead_pool", db)
    # 但没有 bank_analysis
    assert not has_capability(u, "bank_analysis", db)
    db.close()
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_capabilities.py -v
```

Expected: FAIL(ImportError for `services.capabilities`)。

- [ ] **Step 3: 实现 `services/capabilities.py`**

`backend/services/capabilities.py`(新建):

```python
"""Capability 引擎:Role 默认权限集 + 运行时 grant 查询。"""
from __future__ import annotations
from datetime import datetime
from typing import Dict, Set
from sqlalchemy import or_
from sqlalchemy.orm import Session

from db.database import User, UserCapability


# ─── Capability 清单(展示名 + 默认归属 role) ───────────────────────
# 修改此字典会影响前端勾选 UI 与 /api/admin/capabilities 返回。
CAPABILITY_CATALOG: Dict[str, str] = {
    "dashboard": "工作台",
    "lead_pool": "意向池",
    "customer_pool": "客户池",
    "case_library": "客户案例",
    "credit_analysis": "征信分析",
    "bank_analysis": "流水分析",
    "loan_calculator": "贷款计算器",
    "diagnostic": "融资诊断",
    "admin_console": "系统管理",
}


# ─── Role 默认 capability 集 ───────────────────────
ROLE_DEFAULT_CAPS: Dict[str, Set[str]] = {
    "founder": {
        "dashboard", "lead_pool", "customer_pool", "case_library",
        "credit_analysis", "bank_analysis", "loan_calculator",
        "diagnostic", "admin_console",
    },
    "senior_consultant": {
        "dashboard", "lead_pool", "customer_pool", "case_library",
        "credit_analysis", "bank_analysis", "loan_calculator", "diagnostic",
    },
    "junior_consultant": {
        "dashboard", "lead_pool", "customer_pool",
        "credit_analysis", "loan_calculator",
    },
    # 预留(M1 不激活前端),但枚举存在
    "c_end": {
        "dashboard", "credit_analysis", "loan_calculator",
    },
}


# 兜底:未知 role 按 junior_consultant 处理
_FALLBACK_ROLE = "junior_consultant"


def _role_caps(role: str | None) -> Set[str]:
    if role and role in ROLE_DEFAULT_CAPS:
        return ROLE_DEFAULT_CAPS[role]
    return ROLE_DEFAULT_CAPS[_FALLBACK_ROLE]


def effective_capabilities(user: User, db: Session) -> Set[str]:
    """用户实际生效的 capability 集合 = role 默认集 ∪ 未过期未撤销的 grants。"""
    now = datetime.utcnow()
    caps = set(_role_caps(user.role))
    grants = db.query(UserCapability).filter(
        UserCapability.user_id == user.id,
        UserCapability.revoked_at.is_(None),
        or_(
            UserCapability.expires_at.is_(None),
            UserCapability.expires_at > now,
        ),
    ).all()
    for g in grants:
        caps.add(g.feature_key)
    return caps


def has_capability(user: User, feature_key: str, db: Session) -> bool:
    return feature_key in effective_capabilities(user, db)
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && pytest tests/test_capabilities.py -v
```

Expected: PASS(全部用例)。

- [ ] **Step 5: 提交**

```bash
git add backend/services/capabilities.py backend/tests/test_capabilities.py
git commit -m "feat(m1): capability engine with ROLE_DEFAULT_CAPS + effective_capabilities"
```

---

## Task 4: `require_capability` 依赖

**目标:** 在 `services/permissions.py` 扩展 `require_capability(feature_key)`,保留原 `require_role`(向后兼容,内部仅作 role 名检查)。

**Files:**
- Modify: `backend/services/permissions.py`
- Test: `backend/tests/test_permissions.py`(追加)

- [ ] **Step 1: 追加测试**

在 `backend/tests/test_permissions.py` 末尾追加:

```python
def test_require_capability_pass_for_founder(api_client, founder_headers):
    """founder 默认拥有 admin_console。"""
    # 用一个测试路由验证 require_capability 能挂载
    from main import app
    from services.permissions import require_capability
    from fastapi import Depends

    @app.get("/api/_test_admin_only")
    def _ep(user=Depends(require_capability("admin_console"))):
        return {"ok": True, "user": user.username}

    r = api_client.get("/api/_test_admin_only", headers=founder_headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_require_capability_block_when_missing(api_client):
    """junior_consultant 没有 admin_console → 403。"""
    from main import app
    from services.permissions import require_capability
    from fastapi import Depends

    # 注册一个 junior 账号
    r = api_client.post("/api/auth/register",
                        json={"username": "jr", "password": "test123", "display_name": "J"})
    token = r.json()["access_token"]
    # 设置 role=junior_consultant
    from db.database import SessionLocal, User
    db = SessionLocal()
    db.query(User).filter(User.username == "jr").first().role = "junior_consultant"
    db.commit(); db.close()

    @app.get("/api/_test_admin_only2")
    def _ep(user=Depends(require_capability("admin_console"))):
        return {"ok": True}

    r = api_client.get("/api/_test_admin_only2",
                       headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    assert "admin_console" in r.json()["detail"]
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_permissions.py -v
```

Expected: FAIL(`cannot import name 'require_capability'`)。

- [ ] **Step 3: 扩展 `services/permissions.py`**

在 `backend/services/permissions.py` 末尾追加:

```python
from sqlalchemy.orm import Session
from db.database import get_db
from services.capabilities import has_capability


def require_capability(feature_key: str):
    """返回依赖项:只有拥有指定 capability 的用户才能通过。

    使用:
        @router.post("/bank-statements")
        def upload(user: User = Depends(require_capability("bank_analysis"))): ...
    """
    def _dep(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_capability(current_user, feature_key, db):
            raise HTTPException(
                status_code=403,
                detail=f"缺少权限: {feature_key}",
            )
        return current_user

    return _dep
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && pytest tests/test_permissions.py -v
```

Expected: PASS。

- [ ] **Step 5: 全量回归**

```bash
cd backend && pytest -x
```

Expected: 所有既有用例仍绿。

- [ ] **Step 6: 提交**

```bash
git add backend/services/permissions.py backend/tests/test_permissions.py
git commit -m "feat(m1): add require_capability FastAPI dependency"
```

---

## Task 5: 扩展 `/api/auth/me` 返回 `effective_capabilities`

**目标:** 登录后前端能通过 `/me` 拿到 role + capability 集,以驱动菜单。

**Files:**
- Modify: `backend/routers/auth.py`(`UserInfoResponse` 增字段、`/me` endpoint 组装)
- Test: `backend/tests/test_permissions.py`(追加 `/me` 测试)

- [ ] **Step 1: 追加测试**

在 `backend/tests/test_permissions.py` 末尾追加:

```python
def test_me_returns_effective_capabilities(api_client, founder_headers):
    r = api_client.get("/api/auth/me", headers=founder_headers)
    assert r.status_code == 200
    data = r.json()
    assert "effective_capabilities" in data
    caps = set(data["effective_capabilities"])
    # founder 必含 admin_console + bank_analysis
    assert "admin_console" in caps
    assert "bank_analysis" in caps


def test_me_junior_capabilities_limited(api_client):
    r = api_client.post("/api/auth/register",
                        json={"username": "jm", "password": "test123", "display_name": "JM"})
    token = r.json()["access_token"]
    from db.database import SessionLocal, User
    db = SessionLocal()
    db.query(User).filter(User.username == "jm").first().role = "junior_consultant"
    db.commit(); db.close()

    r = api_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    caps = set(r.json()["effective_capabilities"])
    assert "admin_console" not in caps
    assert "bank_analysis" not in caps
    assert "lead_pool" in caps
    assert "customer_pool" in caps
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_permissions.py::test_me_returns_effective_capabilities -v
```

Expected: FAIL(返回体没有 `effective_capabilities` 字段)。

- [ ] **Step 3: 修改 `routers/auth.py`**

在 `UserInfoResponse` 类中加字段:

```python
class UserInfoResponse(BaseModel):
    id: int
    username: str
    display_name: str
    is_active: bool
    role: str = "consultant"
    created_at: str
    effective_capabilities: list[str] = []

    class Config:
        from_attributes = True
```

修改 `/me` endpoint 装填:

```python
from sqlalchemy.orm import Session
from db.database import get_db
from services.capabilities import effective_capabilities


@router.get("/me", response_model=UserInfoResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    caps = sorted(effective_capabilities(current_user, db))
    return UserInfoResponse(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name or current_user.username,
        is_active=current_user.is_active,
        role=current_user.role or "junior_consultant",
        created_at=current_user.created_at.isoformat(),
        effective_capabilities=caps,
    )
```

(若 login/register 也返回 `UserInfoResponse`,同样组装 `effective_capabilities`;如果它们返回的是 `TokenResponse` 则不用改。检查 `routers/auth.py` 第 88 行和 109 行确认。若有必要,把 TokenResponse 也加上 `effective_capabilities` 字段 + 装填。)

- [ ] **Step 4: 运行测试**

```bash
cd backend && pytest tests/test_permissions.py -v
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/routers/auth.py backend/tests/test_permissions.py
git commit -m "feat(m1): /me returns effective_capabilities"
```

---

## Task 6: Admin 路由 — GET 列表 / 详情 / capability 目录

**目标:** 实现 `GET /api/admin/users`、`GET /api/admin/users/{id}`、`GET /api/admin/capabilities`。

**Files:**
- Create: `backend/routers/admin.py`
- Test: `backend/tests/test_admin_routes.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_admin_routes.py`(新建):

```python
"""Founder admin 路由测试。"""


def _make_junior(api_client, username="jr_admin"):
    """注册 junior_consultant 并返回 headers。"""
    r = api_client.post("/api/auth/register",
                        json={"username": username, "password": "test123", "display_name": username})
    from db.database import SessionLocal, User
    db = SessionLocal()
    db.query(User).filter(User.username == username).first().role = "junior_consultant"
    db.commit(); db.close()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_list_users_requires_admin_console(api_client, founder_headers):
    r = api_client.get("/api/admin/users", headers=founder_headers)
    assert r.status_code == 200
    data = r.json()
    assert "total" in data and "users" in data
    assert data["total"] >= 1


def test_list_users_403_for_junior(api_client):
    hdr = _make_junior(api_client)
    r = api_client.get("/api/admin/users", headers=hdr)
    assert r.status_code == 403


def test_list_users_filter_by_role(api_client, founder_headers):
    _make_junior(api_client, "j1")
    _make_junior(api_client, "j2")
    r = api_client.get("/api/admin/users?role=junior_consultant", headers=founder_headers)
    assert r.status_code == 200
    roles = [u["role"] for u in r.json()["users"]]
    assert all(rr == "junior_consultant" for rr in roles)
    assert len(roles) == 2


def test_get_user_detail(api_client, founder_headers):
    _make_junior(api_client, "juser")
    from db.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.username == "juser").first().id
    db.close()

    r = api_client.get(f"/api/admin/users/{uid}", headers=founder_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "juser"
    assert "capabilities" in data
    assert "effective_capabilities" in data


def test_get_user_detail_404(api_client, founder_headers):
    r = api_client.get("/api/admin/users/99999", headers=founder_headers)
    assert r.status_code == 404


def test_capabilities_catalog(api_client, founder_headers):
    r = api_client.get("/api/admin/capabilities", headers=founder_headers)
    assert r.status_code == 200
    data = r.json()
    assert "capabilities" in data
    keys = {c["feature_key"] for c in data["capabilities"]}
    assert "admin_console" in keys
    assert "bank_analysis" in keys
    # 含每项中文名 + 哪些 role 默认
    entry = next(c for c in data["capabilities"] if c["feature_key"] == "admin_console")
    assert entry["label"] == "系统管理"
    assert "founder" in entry["default_roles"]
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_admin_routes.py -v
```

Expected: FAIL(404 for `/api/admin/*`)。

- [ ] **Step 3: 新建 `routers/admin.py`**

```python
"""Founder admin V1:用户列表、详情、capability 目录。"""
from __future__ import annotations
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db.database import get_db, User, UserCapability
from services.permissions import require_capability
from services.capabilities import (
    CAPABILITY_CATALOG,
    ROLE_DEFAULT_CAPS,
    effective_capabilities,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── Schemas ───
class UserListItem(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    extra_grants: List[str]
    created_at: str


class UserListResponse(BaseModel):
    total: int
    users: List[UserListItem]


class CapabilityGrant(BaseModel):
    feature_key: str
    source: str
    granted_at: str
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None


class UserDetailResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    created_at: str
    capabilities: List[CapabilityGrant]
    effective_capabilities: List[str]


class CapabilityCatalogItem(BaseModel):
    feature_key: str
    label: str
    default_roles: List[str]


class CapabilityCatalogResponse(BaseModel):
    capabilities: List[CapabilityCatalogItem]


# ─── Helpers ───
def _extra_grants(db: Session, user_id: int) -> List[str]:
    """返回该用户所有未过期、未撤销、非 role_default 的 feature_key。"""
    now = datetime.utcnow()
    rows = db.query(UserCapability).filter(
        UserCapability.user_id == user_id,
        UserCapability.revoked_at.is_(None),
        or_(
            UserCapability.expires_at.is_(None),
            UserCapability.expires_at > now,
        ),
    ).all()
    return sorted({r.feature_key for r in rows})


# ─── Endpoints ───
@router.get("/users", response_model=UserListResponse)
def list_users(
    q: Optional[str] = Query(None, description="用户名模糊搜索"),
    role: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_capability("admin_console")),
):
    query = db.query(User)
    if q:
        query = query.filter(User.username.ilike(f"%{q}%"))
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    rows = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return UserListResponse(
        total=total,
        users=[
            UserListItem(
                id=u.id,
                username=u.username,
                display_name=u.display_name or u.username,
                role=u.role or "junior_consultant",
                is_active=bool(u.is_active),
                extra_grants=_extra_grants(db, u.id),
                created_at=u.created_at.isoformat() if u.created_at else "",
            )
            for u in rows
        ],
    )


@router.get("/users/{user_id}", response_model=UserDetailResponse)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_capability("admin_console")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "用户不存在")
    caps_rows = (
        db.query(UserCapability)
        .filter(UserCapability.user_id == user_id)
        .order_by(UserCapability.granted_at.desc())
        .all()
    )
    capabilities = [
        CapabilityGrant(
            feature_key=c.feature_key,
            source=c.source,
            granted_at=c.granted_at.isoformat() if c.granted_at else "",
            expires_at=c.expires_at.isoformat() if c.expires_at else None,
            revoked_at=c.revoked_at.isoformat() if c.revoked_at else None,
        )
        for c in caps_rows
    ]
    return UserDetailResponse(
        id=u.id,
        username=u.username,
        display_name=u.display_name or u.username,
        role=u.role or "junior_consultant",
        is_active=bool(u.is_active),
        created_at=u.created_at.isoformat() if u.created_at else "",
        capabilities=capabilities,
        effective_capabilities=sorted(effective_capabilities(u, db)),
    )


@router.get("/capabilities", response_model=CapabilityCatalogResponse)
def get_capability_catalog(
    _: User = Depends(require_capability("admin_console")),
):
    items: List[CapabilityCatalogItem] = []
    for key, label in CAPABILITY_CATALOG.items():
        default_roles = [r for r, caps in ROLE_DEFAULT_CAPS.items() if key in caps]
        items.append(CapabilityCatalogItem(
            feature_key=key, label=label, default_roles=default_roles,
        ))
    return CapabilityCatalogResponse(capabilities=items)
```

- [ ] **Step 4: 在 `main.py` 注册 router(本 step 仅临时)**

```python
from routers import (
    auth, clients, credit_report, credit_image, bank_statement,
    analysis, export, diagnosis, customers, cases, admin,
)
...
app.include_router(admin.router)
```

- [ ] **Step 5: 运行测试**

```bash
cd backend && pytest tests/test_admin_routes.py -v
```

Expected: PASS(所有 GET 用例)。

- [ ] **Step 6: 提交**

```bash
git add backend/routers/admin.py backend/main.py backend/tests/test_admin_routes.py
git commit -m "feat(m1): admin GET /users /users/{id} /capabilities"
```

---

## Task 7: Admin 路由 — PATCH role / PUT capabilities

**目标:** 实现 `PATCH /api/admin/users/{id}/role` 和 `PUT /api/admin/users/{id}/capabilities`(全量替换 manual_grant)。

**Files:**
- Modify: `backend/routers/admin.py`(追加两个 endpoint)
- Test: `backend/tests/test_admin_routes.py`(追加)

- [ ] **Step 1: 追加测试**

在 `backend/tests/test_admin_routes.py` 末尾追加:

```python
def test_patch_role_success(api_client, founder_headers):
    _make_junior(api_client, "jup")
    from db.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.username == "jup").first().id
    db.close()

    r = api_client.patch(f"/api/admin/users/{uid}/role",
                        json={"role": "senior_consultant"},
                        headers=founder_headers)
    assert r.status_code == 200
    assert r.json()["role"] == "senior_consultant"
    assert "bank_analysis" in r.json()["effective_capabilities"]


def test_patch_role_invalid(api_client, founder_headers):
    _make_junior(api_client, "jinv")
    from db.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.username == "jinv").first().id
    db.close()

    r = api_client.patch(f"/api/admin/users/{uid}/role",
                        json={"role": "god_mode"},
                        headers=founder_headers)
    assert r.status_code == 400


def test_patch_role_c_end_forbidden(api_client, founder_headers):
    """c_end 角色在 M1 不允许分配。"""
    _make_junior(api_client, "jcend")
    from db.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.username == "jcend").first().id
    db.close()

    r = api_client.patch(f"/api/admin/users/{uid}/role",
                        json={"role": "c_end"}, headers=founder_headers)
    assert r.status_code == 400


def test_patch_role_self_downgrade_blocked(api_client, founder_headers):
    """founder 不允许自我降级。"""
    from db.database import SessionLocal, User
    db = SessionLocal()
    me = db.query(User).filter(User.username == "founder_u").first()
    uid = me.id
    db.close()

    r = api_client.patch(f"/api/admin/users/{uid}/role",
                        json={"role": "senior_consultant"}, headers=founder_headers)
    assert r.status_code == 400
    assert "自" in r.json()["detail"] or "self" in r.json()["detail"].lower()


def test_put_capabilities_replaces_manual_grants(api_client, founder_headers):
    _make_junior(api_client, "jg")
    from db.database import SessionLocal, User, UserCapability
    db = SessionLocal()
    uid = db.query(User).filter(User.username == "jg").first().id
    # 预置一张旧的 manual_grant 要被替换掉
    db.add(UserCapability(user_id=uid, feature_key="case_library", source="manual_grant"))
    db.commit(); db.close()

    r = api_client.put(
        f"/api/admin/users/{uid}/capabilities",
        json={"grants": [
            {"feature_key": "bank_analysis", "expires_at": None},
            {"feature_key": "diagnostic", "expires_at": "2099-12-31T23:59:59"},
        ]},
        headers=founder_headers,
    )
    assert r.status_code == 200, r.text
    caps = set(r.json()["effective_capabilities"])
    # 新授权生效
    assert "bank_analysis" in caps
    assert "diagnostic" in caps
    # 旧授权撤销
    assert "case_library" not in caps

    # 数据库:旧记录 revoked_at 非空
    db = SessionLocal()
    old = db.query(UserCapability).filter(
        UserCapability.user_id == uid,
        UserCapability.feature_key == "case_library",
    ).all()
    assert len(old) == 1
    assert old[0].revoked_at is not None
    db.close()


def test_put_capabilities_invalid_key(api_client, founder_headers):
    _make_junior(api_client, "jgi")
    from db.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.username == "jgi").first().id
    db.close()

    r = api_client.put(
        f"/api/admin/users/{uid}/capabilities",
        json={"grants": [{"feature_key": "not_a_real_feature", "expires_at": None}]},
        headers=founder_headers,
    )
    assert r.status_code == 400
```

- [ ] **Step 2: 运行测试,确认失败**

```bash
cd backend && pytest tests/test_admin_routes.py -v
```

Expected: FAIL(endpoint 不存在 → 405 / 404)。

- [ ] **Step 3: 在 `routers/admin.py` 追加 endpoints**

追加 schemas(文件顶部 schemas 区域末尾):

```python
class PatchRoleBody(BaseModel):
    role: str


class GrantInput(BaseModel):
    feature_key: str
    expires_at: Optional[datetime] = None


class PutCapabilitiesBody(BaseModel):
    grants: List[GrantInput]
```

追加 endpoints(文件末尾):

```python
# 允许分配的 role 集(排除 c_end — M1 预留不激活)
_ASSIGNABLE_ROLES = {"founder", "senior_consultant", "junior_consultant"}


@router.patch("/users/{user_id}/role", response_model=UserDetailResponse)
def patch_user_role(
    user_id: int,
    body: PatchRoleBody,
    db: Session = Depends(get_db),
    current: User = Depends(require_capability("admin_console")),
):
    if body.role not in _ASSIGNABLE_ROLES:
        raise HTTPException(400, f"不允许的 role: {body.role}")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "用户不存在")
    # 禁止自我降级
    if u.id == current.id and body.role != "founder":
        raise HTTPException(400, "不允许将自己从 founder 降级")
    u.role = body.role
    db.commit()
    db.refresh(u)
    return get_user_detail(user_id, db, current)


@router.put("/users/{user_id}/capabilities", response_model=UserDetailResponse)
def put_user_capabilities(
    user_id: int,
    body: PutCapabilitiesBody,
    db: Session = Depends(get_db),
    current: User = Depends(require_capability("admin_console")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "用户不存在")
    # 校验 key 都在 catalog 中
    for g in body.grants:
        if g.feature_key not in CAPABILITY_CATALOG:
            raise HTTPException(400, f"未知的 feature_key: {g.feature_key}")
    now = datetime.utcnow()
    # 1) 把该用户现有的未撤销 manual_grant 全部撤销
    active_grants = db.query(UserCapability).filter(
        UserCapability.user_id == user_id,
        UserCapability.source == "manual_grant",
        UserCapability.revoked_at.is_(None),
    ).all()
    for row in active_grants:
        row.revoked_at = now
    # 2) 插入新的 grants
    for g in body.grants:
        db.add(UserCapability(
            user_id=user_id,
            feature_key=g.feature_key,
            source="manual_grant",
            granted_by_id=current.id,
            granted_at=now,
            expires_at=g.expires_at,
        ))
    db.commit()
    return get_user_detail(user_id, db, current)
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && pytest tests/test_admin_routes.py -v
```

Expected: PASS。

- [ ] **Step 5: 全量回归**

```bash
cd backend && pytest -x
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add backend/routers/admin.py backend/tests/test_admin_routes.py
git commit -m "feat(m1): admin PATCH /role + PUT /capabilities with replace semantics"
```

---

## Task 8: 更新 conftest fixtures 用新 role 名

**目标:** 把 `conftest.py` 里 `consultant_headers` / `telesales_headers` 同步改成 senior/junior。保留旧名作 alias 避免大规模改测试。

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: 修改 fixtures**

在 `backend/tests/conftest.py` 末尾替换:

```python
@pytest.fixture
def consultant_headers(api_client):
    """向后兼容别名 = senior_consultant。"""
    token = _register_and_auth(api_client, "consultant_u")
    _set_user_role("consultant_u", "senior_consultant")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def telesales_headers(api_client):
    """向后兼容别名 = junior_consultant。"""
    token = _register_and_auth(api_client, "telesales_u")
    _set_user_role("telesales_u", "junior_consultant")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def senior_consultant_headers(api_client):
    token = _register_and_auth(api_client, "senior_u")
    _set_user_role("senior_u", "senior_consultant")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def junior_consultant_headers(api_client):
    token = _register_and_auth(api_client, "junior_u")
    _set_user_role("junior_u", "junior_consultant")
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2: 全量回归**

```bash
cd backend && pytest -x
```

Expected: 全绿。若有失败,不改测试逻辑,只改 fixture 保证兼容。

- [ ] **Step 3: 提交**

```bash
git add backend/tests/conftest.py
git commit -m "chore(m1): update test fixtures to senior/junior role names"
```

---

## Task 9: 清理 `routers/customers.py` 硬编码

**目标:** 把 `role == "founder"` / `role == "telesales"` / `require_role(...)` 改成 capability 判断。

**Files:**
- Modify: `backend/routers/customers.py`

**改造原则:**
| 旧代码 | 新代码 | 语义 |
|---|---|---|
| `role == "founder"` | `has_capability(user, "admin_console", db)` | 管理员 |
| `role == "telesales"` | `not has_capability(user, "customer_pool", db)` → 改为:**按"只能写 lead 阶段"的 capability 判断**(见下) | junior 限制 |
| `require_role("founder")` | `require_capability("admin_console")` | 同上 |
| `require_role(["founder", "consultant"])` | 去掉,替换为 `require_capability("customer_pool")` | 客户池访问 |

**注:** "电销只能录入 lead 阶段"这条业务规则在 M1 仍保留但用 capability 表达 — junior_consultant 默认**没有** `customer_pool_write_non_lead` capability。为避免 M1 再引入新 capability,暂用"role 是 junior_consultant"作为等价判断,但封装在 helper 里,M2 或将来扩展时只改一处。

- [ ] **Step 1: 顶部 import 调整**

把 `from services.permissions import require_role` 改为:

```python
from services.permissions import require_capability
from services.capabilities import has_capability
```

- [ ] **Step 2: 添加 helper**

在 `# ---------- Helpers ----------` 块内替换 `_can_write_customer`:

```python
def _is_admin(user: User, db: Session) -> bool:
    return has_capability(user, "admin_console", db)


def _can_write_customer(user: User, customer: Customer, db: Session) -> bool:
    if _is_admin(user, db):
        return True
    if customer.created_by_id == user.id or customer.assigned_to_id == user.id:
        return True
    return False
```

(所有调用方要补 `db` 参数。)

- [ ] **Step 3: 改写每个 endpoint**

对每个出现 `role == "..."` 的地方改成 capability 判断。示例 `create_customer`:

```python
@router.post("", response_model=CustomerOut)
def create_customer(
    body: CustomerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("customer_pool")),
):
    # junior_consultant 只能录入 lead 阶段
    role = (user.role or "junior_consultant").lower()
    if role == "junior_consultant" and body.stage != "lead":
        raise HTTPException(403, "初级顾问只能录入意向(lead)阶段客户")
    ...
```

示例 `list_customers` / `get_customer` / `update_customer` / `delete_customer`:

```python
@router.get("", response_model=List[CustomerOut])
def list_customers(
    stage: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("customer_pool")),
):
    q = db.query(Customer)
    if not _is_admin(user, db):
        q = q.filter(
            (Customer.created_by_id == user.id) | (Customer.assigned_to_id == user.id)
        )
    if stage:
        q = q.filter(Customer.stage == stage)
    return q.order_by(Customer.created_at.desc()).all()


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("customer_pool")),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _is_admin(user, db) and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户")
    return c


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    body: CustomerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("customer_pool")),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c, db):
        raise HTTPException(403, "无权修改此客户")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("customer_pool")),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c, db):
        raise HTTPException(403, "无权删除此客户")
    db.delete(c)
    db.commit()
    return {"ok": True}
```

示例 `assign_customer`:

```python
@router.post("/{customer_id}/assign", response_model=CustomerOut)
def assign_customer(
    customer_id: int,
    body: AssignBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("admin_console")),
):
    ...
```

示例 `list_interactions` / `add_interaction`:

```python
@router.get("/{customer_id}/interactions", response_model=List[InteractionOut])
def list_interactions(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability("customer_pool")),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _is_admin(user, db) and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户跟进")
    ...
```

(所有涉及 `_can_write_customer(user, c)` 的调用都补成 `_can_write_customer(user, c, db)`。)

- [ ] **Step 4: 运行 customers 相关测试**

```bash
cd backend && pytest tests/test_customers.py -v
```

Expected: PASS(若存在 fixture 命名问题,按 Task 8 的 alias 兼容;如有硬断言"role==telesales"的地方,同步改成"junior_consultant")。

- [ ] **Step 5: 全量回归**

```bash
cd backend && pytest -x
```

Expected: 全绿。

- [ ] **Step 6: 核验硬编码已清理**

```bash
grep -nE "require_role|role\s*==\s*\"(founder|consultant|telesales)\"" backend/routers/customers.py
```

Expected: **仅剩** `role == "junior_consultant"` 这一类(允许,因为是业务语义),**无** `require_role` / `role == "founder"` / `role == "telesales"` / `role == "consultant"`。

- [ ] **Step 7: 提交**

```bash
git add backend/routers/customers.py
git commit -m "refactor(m1): customers router switches to capability checks"
```

---

## Task 10: 清理 `routers/cases.py` 硬编码

**目标:** 同 Task 9,但作用于 `routers/cases.py`。

**Files:**
- Modify: `backend/routers/cases.py`

**改造参照:**
| 旧 | 新 |
|---|---|
| `require_role(["founder", "consultant"])` | `require_capability("case_library")` |
| `require_role("founder")` | `require_capability("admin_console")` |
| `role == "founder"` 比较 | `has_capability(user, "admin_console", db)` |

- [ ] **Step 1: 修改 import**

```python
from services.permissions import require_capability
from services.capabilities import has_capability
```

删除 `from services.permissions import require_role`(如只存在这一处)。

- [ ] **Step 2: 用 grep 定位所有硬编码**

```bash
grep -n "require_role\|user.role\|role ==" backend/routers/cases.py
```

逐行改写:`role = (user.role or "consultant").lower(); if role == "founder":` → `if has_capability(user, "admin_console", db):`。

`Depends(require_role("founder"))` → `Depends(require_capability("admin_console"))`。
`Depends(require_role(["founder", "consultant"]))` → `Depends(require_capability("case_library"))`。

如有"审核"相关语义(发布 case),用 `admin_console`(只有 founder)。

- [ ] **Step 3: 测试**

```bash
cd backend && pytest tests/test_cases.py -v
```

Expected: PASS(若 fixture 依赖旧 role 名,靠 Task 8 的 alias 兼容)。

- [ ] **Step 4: 全量回归**

```bash
cd backend && pytest -x
```

Expected: 全绿。

- [ ] **Step 5: 核验**

```bash
grep -nE "require_role|role\s*==\s*\"(founder|consultant|telesales)\"" backend/routers/cases.py
```

Expected: 空输出(或仅注释)。

- [ ] **Step 6: 提交**

```bash
git add backend/routers/cases.py
git commit -m "refactor(m1): cases router switches to capability checks"
```

---

## Task 11: 前端 auth 类型扩展 + /me 自动刷新

**目标:** `AuthUser` / `TokenResponse` 增加 `effective_capabilities`,登录成功后自动调 `/me` 补齐。

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 扩展类型 + 新 helper**

修改 `AuthUser` 和 `TokenResponse`:

```ts
export interface AuthUser {
  user_id: number;
  username: string;
  display_name: string;
  role?: string;
  effective_capabilities?: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  display_name: string;
  role?: string;
  effective_capabilities?: string[];
}
```

在 `isLoggedIn` 后面追加:

```ts
export interface MeResponse {
  id: number;
  username: string;
  display_name: string;
  is_active: boolean;
  role: string;
  created_at: string;
  effective_capabilities: string[];
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await http.get<MeResponse>('/auth/me');
  // 同步到 localStorage(保持 AuthUser 就能被 getStoredUser 读到)
  const stored = getStoredUser();
  if (stored) {
    const merged: AuthUser = {
      ...stored,
      role: data.role,
      effective_capabilities: data.effective_capabilities,
    };
    localStorage.setItem('user', JSON.stringify(merged));
  }
  return data;
}

export function hasCapability(key: string): boolean {
  const user = getStoredUser();
  return !!user?.effective_capabilities?.includes(key);
}
```

- [ ] **Step 2: 登录/注册成功后拉 /me**

修改 `login` 和 `register`:

```ts
export async function login(username: string, password: string): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>('/auth/login', { username, password });
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data));
  // 拉取完整 capability
  try { await fetchMe(); } catch (_) { /* 容错 */ }
  return data;
}

export async function register(
  username: string, password: string, displayName: string,
): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>('/auth/register', {
    username, password, display_name: displayName,
  });
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data));
  try { await fetchMe(); } catch (_) { /* 容错 */ }
  return data;
}
```

- [ ] **Step 3: 构建冒烟**

```bash
cd frontend && npm run build
```

Expected: 成功,无 ts 错误。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(m1): frontend auth types + fetchMe/hasCapability helpers"
```

---

## Task 12: `App.tsx` 菜单 capability 驱动 + roleLabel 映射

**目标:** 菜单过滤从 `roles[]` 改为 `capability` 字符串;"客户" label → "客户池";roleLabel 用映射;hash 路由支持 `#/admin/users` / `#/admin/users/:id`。

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 扩展 PageKey + hash 解析**

修改 `PageKey` 类型,增加 `admin-users` / `admin-user-detail`:

```ts
type PageKey =
  | 'dashboard' | 'credit' | 'bank' | 'calculator' | 'diagnostic'
  | 'leads' | 'customers' | 'customer-detail'
  | 'cases' | 'case-new' | 'case-edit'
  | 'admin-users' | 'admin-user-detail';
```

`parseHash` 新增分支:

```ts
function parseHash(): { page: PageKey; id?: number } {
  const hash = window.location.hash || '';
  const mCustomerDetail = hash.match(/^#\/customers\/(\d+)$/);
  if (mCustomerDetail) return { page: 'customer-detail', id: Number(mCustomerDetail[1]) };
  const mAdminUserDetail = hash.match(/^#\/admin\/users\/(\d+)$/);
  if (mAdminUserDetail) return { page: 'admin-user-detail', id: Number(mAdminUserDetail[1]) };
  const mCaseEdit = hash.match(/^#\/cases\/(\d+)\/edit$/);
  if (mCaseEdit) return { page: 'case-edit', id: Number(mCaseEdit[1]) };
  if (hash === '#/admin/users') return { page: 'admin-users' };
  if (hash === '#/leads') return { page: 'leads' };
  if (hash === '#/customers') return { page: 'customers' };
  if (hash === '#/cases') return { page: 'cases' };
  if (hash === '#/cases/new') return { page: 'case-new' };
  if (hash === '#/credit') return { page: 'credit' };
  if (hash === '#/bank') return { page: 'bank' };
  if (hash === '#/calculator') return { page: 'calculator' };
  if (hash === '#/diagnostic') return { page: 'diagnostic' };
  return { page: 'dashboard' };
}
```

`navigate` 的 `hashMap` 增加:

```ts
const hashMap: Record<PageKey, string> = {
  dashboard: '#/',
  credit: '#/credit',
  bank: '#/bank',
  calculator: '#/calculator',
  diagnostic: '#/diagnostic',
  leads: '#/leads',
  customers: '#/customers',
  'customer-detail': '#/customers',
  cases: '#/cases',
  'case-new': '#/cases/new',
  'case-edit': '#/cases',
  'admin-users': '#/admin/users',
  'admin-user-detail': '#/admin/users',
};
```

- [ ] **Step 2: 菜单 capability 驱动 + ROLE_LABELS**

顶部 import 处追加:

```ts
import { SettingOutlined } from '@ant-design/icons';
```

替换 `type AppMenuItem = ...` 为:

```ts
type AppMenuItem = NonNullable<MenuProps['items']>[number] & {
  capability?: string;
};

const ROLE_LABELS: Record<string, string> = {
  founder: '创始人',
  senior_consultant: '专属顾问',
  junior_consultant: '初级顾问',
  c_end: '企业客户',
  // 兼容遗留数据
  consultant: '专属顾问',
  telesales: '初级顾问',
};
```

替换 `menuItems` 计算逻辑:

```ts
const caps = useMemo(
  () => new Set(user?.effective_capabilities ?? []),
  [user?.effective_capabilities],
);

const menuItems: AppMenuItem[] = useMemo(() => {
  const all: AppMenuItem[] = [
    { key: 'dashboard', icon: <HomeOutlined />, label: '工作台', capability: 'dashboard' },
    { key: 'leads', icon: <TeamOutlined />, label: '意向池', capability: 'lead_pool' },
    { key: 'customers', icon: <ContactsOutlined />, label: '客户池', capability: 'customer_pool' },
    { key: 'cases', icon: <BookOutlined />, label: '客户案例', capability: 'case_library' },
    { key: 'credit', icon: <FileSearchOutlined />, label: '征信分析', capability: 'credit_analysis' },
    { key: 'bank', icon: <BankOutlined />, label: '流水分析', capability: 'bank_analysis' },
    { key: 'calculator', icon: <CalculatorOutlined />, label: '贷款计算器', capability: 'loan_calculator' },
    { key: 'diagnostic', icon: <MedicineBoxOutlined />, label: '融资诊断', capability: 'diagnostic' },
    { key: 'admin-users', icon: <SettingOutlined />, label: '系统管理', capability: 'admin_console' },
  ];
  return all.filter((it) => !it.capability || caps.has(it.capability));
}, [caps]);
```

替换 `roleLabel`:

```ts
const roleLabel = ROLE_LABELS[role] ?? '用户';
```

- [ ] **Step 3: selectedKey 同步**

```ts
const selectedKey: string =
  route.page === 'customer-detail' ? 'customers'
  : route.page === 'case-new' || route.page === 'case-edit' ? 'cases'
  : route.page === 'admin-user-detail' ? 'admin-users'
  : route.page;
```

- [ ] **Step 4: 登录成功后刷新 /me**

修改 `handleLoginSuccess`:

```ts
const handleLoginSuccess = useCallback(async () => {
  try { await (await import('./services/api')).fetchMe(); } catch (_) { /* ignore */ }
  setLoggedIn(true);
  setLoginModalOpen(false);
}, []);
```

(更简洁:顶部 import `fetchMe`,然后 `await fetchMe()`。)

- [ ] **Step 5: Content 区域预留 admin 路由**

在 Content 的 `route.page === 'diagnostic'` 下面先加占位(真正的组件 Task 14/15 实现):

```tsx
{route.page === 'admin-users' && <div>/* AdminUsers 页面 (Task 14) */</div>}
{route.page === 'admin-user-detail' && (
  route.id
    ? <div>/* AdminUserDetail 页面 id={route.id} (Task 15) */</div>
    : <div>用户 ID 无效</div>
)}
```

- [ ] **Step 6: 构建冒烟**

```bash
cd frontend && npm run build
```

Expected: 成功。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat(m1): App.tsx capability-driven menu + admin routes + roleLabel map"
```

---

## Task 13: `Customers.tsx` Tabs 切换(全部/跟进中/已成交/已拒绝/意向)

**目标:** 修复"意向池→详情→返回列表看不到"的体验问题。默认 tab"全部"。

**Files:**
- Modify: `frontend/src/pages/Customers.tsx`

- [ ] **Step 1: 读取当前 Customers 页面**

```bash
# 先读 frontend/src/pages/Customers.tsx 了解现有结构
```

- [ ] **Step 2: 在页面顶部加 `Tabs`**

import 区加 `Tabs`:

```ts
import { Tabs } from 'antd';
```

定义 stage 过滤映射:

```ts
type StageTab = 'all' | 'active' | 'won' | 'lost' | 'lead';

const TAB_DEFS: { key: StageTab; label: string; stages: string[] | null }[] = [
  { key: 'all',    label: '全部',   stages: null },
  { key: 'active', label: '跟进中', stages: ['invited', 'consulting', 'proposal'] },
  { key: 'won',    label: '已成交', stages: ['closed_won'] },
  { key: 'lost',   label: '已拒绝', stages: ['closed_lost'] },
  { key: 'lead',   label: '意向',   stages: ['lead'] },
];
```

在组件内增加 state:

```ts
const [tab, setTab] = useState<StageTab>('all');
```

在渲染顶部:

```tsx
<Tabs
  activeKey={tab}
  onChange={(k) => setTab(k as StageTab)}
  items={TAB_DEFS.map(t => ({ key: t.key, label: t.label }))}
/>
```

客户列表展示处加本地过滤:

```ts
const tabDef = TAB_DEFS.find(t => t.key === tab)!;
const visible = tabDef.stages
  ? customers.filter(c => tabDef.stages!.includes(c.stage))
  : customers;
```

原本的 `<Table dataSource={customers} ...>` 改成 `<Table dataSource={visible} ...>`。

(若原代码是按服务端 `?stage=` 过滤,这里改为客户端过滤 + 不传 stage 参数,保留"一次取回按 tab 本地切换"的响应速度。)

- [ ] **Step 3: 构建冒烟**

```bash
cd frontend && npm run build
```

Expected: 成功。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/Customers.tsx
git commit -m "feat(m1): Customers page adds stage tabs (all default)"
```

---

## Task 14: `AdminUsers.tsx` 用户列表页

**目标:** 展示全部用户 / 支持用户名搜索 + role 过滤 / 行操作 → 详情页。

**Files:**
- Create: `frontend/src/services/adminApi.ts`
- Create: `frontend/src/pages/AdminUsers.tsx`

- [ ] **Step 1: 新建 `adminApi.ts`**

```ts
import axios from 'axios';

const http = axios.create({ baseURL: '/api/admin', timeout: 30000 });
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface AdminUserListItem {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  extra_grants: string[];
  created_at: string;
}

export interface AdminUserListResponse {
  total: number;
  users: AdminUserListItem[];
}

export interface AdminCapabilityGrant {
  feature_key: string;
  source: string;
  granted_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
}

export interface AdminUserDetail {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  capabilities: AdminCapabilityGrant[];
  effective_capabilities: string[];
}

export interface CatalogItem {
  feature_key: string;
  label: string;
  default_roles: string[];
}

export async function listAdminUsers(params: {
  q?: string; role?: string; page?: number; page_size?: number;
}): Promise<AdminUserListResponse> {
  const { data } = await http.get('/users', { params });
  return data;
}

export async function getAdminUser(id: number): Promise<AdminUserDetail> {
  const { data } = await http.get(`/users/${id}`);
  return data;
}

export async function patchUserRole(id: number, role: string): Promise<AdminUserDetail> {
  const { data } = await http.patch(`/users/${id}/role`, { role });
  return data;
}

export async function putUserCapabilities(
  id: number,
  grants: { feature_key: string; expires_at: string | null }[],
): Promise<AdminUserDetail> {
  const { data } = await http.put(`/users/${id}/capabilities`, { grants });
  return data;
}

export async function getCapabilityCatalog(): Promise<{ capabilities: CatalogItem[] }> {
  const { data } = await http.get('/capabilities');
  return data;
}
```

- [ ] **Step 2: 新建 `AdminUsers.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Card, Table, Input, Select, Space, Button, Tag, Typography } from 'antd';
import { listAdminUsers, AdminUserListItem } from '../services/adminApi';

const { Title } = Typography;

const ROLE_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'founder', label: '创始人' },
  { value: 'senior_consultant', label: '专属顾问' },
  { value: 'junior_consultant', label: '初级顾问' },
];

const ROLE_LABEL: Record<string, string> = {
  founder: '创始人',
  senior_consultant: '专属顾问',
  junior_consultant: '初级顾问',
  c_end: '企业客户',
};

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listAdminUsers({
        q: q || undefined, role: role || undefined, page, page_size: 20,
      });
      setUsers(res.users); setTotal(res.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, role]);

  return (
    <Card>
      <Title level={4}>系统管理 · 用户列表</Title>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索用户名"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => { setQ(v); setPage(1); load(); }}
        />
        <Select
          style={{ width: 180 }}
          value={role}
          options={ROLE_OPTIONS}
          onChange={(v) => { setRole(v); setPage(1); }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
        columns={[
          { title: '用户名', dataIndex: 'username' },
          { title: '显示名', dataIndex: 'display_name' },
          { title: '角色', dataIndex: 'role', render: (r) => <Tag>{ROLE_LABEL[r] ?? r}</Tag> },
          {
            title: '状态', dataIndex: 'is_active',
            render: (a) => a ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
          },
          {
            title: '额外授权', dataIndex: 'extra_grants',
            render: (gs: string[]) => gs.length
              ? gs.map((g) => <Tag key={g} color="gold">{g}</Tag>)
              : <span style={{ color: '#999' }}>—</span>,
          },
          {
            title: '操作', key: 'op',
            render: (_, row) => (
              <Button type="link" onClick={() => { window.location.hash = `#/admin/users/${row.id}`; }}>
                详情
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}
```

- [ ] **Step 3: 构建冒烟**

```bash
cd frontend && npm run build
```

Expected: 成功。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/services/adminApi.ts frontend/src/pages/AdminUsers.tsx
git commit -m "feat(m1): AdminUsers list page + adminApi service"
```

---

## Task 15: `AdminUserDetail.tsx` 用户详情 + 权限编辑

**目标:** 展示基本信息 / 角色切换 / capability 勾选区(role_default 灰勾不可改)+ 保存按钮调 `PUT /capabilities`。

**Files:**
- Create: `frontend/src/pages/AdminUserDetail.tsx`

- [ ] **Step 1: 新建组件**

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Descriptions, Radio, Checkbox, DatePicker, Button, message, Space,
  Typography, Tag, Divider, Tooltip,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import {
  getAdminUser, getCapabilityCatalog, patchUserRole, putUserCapabilities,
  AdminUserDetail as UserDetail, CatalogItem,
} from '../services/adminApi';

const { Title } = Typography;

const ROLE_OPTIONS = [
  { value: 'founder', label: '创始人' },
  { value: 'senior_consultant', label: '专属顾问' },
  { value: 'junior_consultant', label: '初级顾问' },
];

interface Props { userId: number }

export default function AdminUserDetailPage({ userId }: Props) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<Map<string, Dayjs | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const roleDefaults = useMemo(() => {
    const roleCaps = new Set<string>();
    if (!user) return roleCaps;
    catalog.forEach((c) => {
      if (c.default_roles.includes(user.role)) roleCaps.add(c.feature_key);
    });
    return roleCaps;
  }, [user, catalog]);

  const load = async () => {
    setLoading(true);
    try {
      const [u, cat] = await Promise.all([getAdminUser(userId), getCapabilityCatalog()]);
      setUser(u); setCatalog(cat.capabilities);
      // 预填 checkbox:当前生效的 manual_grant
      const m = new Map<string, Dayjs | null>();
      u.capabilities
        .filter((c) => c.source === 'manual_grant' && !c.revoked_at)
        .filter((c) => !c.expires_at || dayjs(c.expires_at).isAfter(dayjs()))
        .forEach((c) => m.set(c.feature_key, c.expires_at ? dayjs(c.expires_at) : null));
      setSelected(m);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  const handleToggle = (key: string, on: boolean) => {
    const m = new Map(selected);
    if (on) m.set(key, null);
    else m.delete(key);
    setSelected(m);
  };

  const handleExpiresChange = (key: string, d: Dayjs | null) => {
    const m = new Map(selected);
    m.set(key, d);
    setSelected(m);
  };

  const onSaveRole = async (role: string) => {
    if (!user) return;
    try {
      setSaving(true);
      const updated = await patchUserRole(userId, role);
      setUser(updated);
      message.success('角色已更新');
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? '更新失败');
    } finally { setSaving(false); }
  };

  const onSaveCaps = async () => {
    try {
      setSaving(true);
      const grants = Array.from(selected.entries()).map(([feature_key, exp]) => ({
        feature_key,
        expires_at: exp ? exp.toISOString() : null,
      }));
      const updated = await putUserCapabilities(userId, grants);
      setUser(updated);
      message.success('权限已保存');
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? '保存失败');
    } finally { setSaving(false); }
  };

  if (loading || !user) return <Card loading />;

  return (
    <Card>
      <Title level={4}>用户详情 · {user.display_name}</Title>
      <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
        <Descriptions.Item label="状态">
          {user.is_active ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="创建时间" span={2}>
          {user.created_at}
        </Descriptions.Item>
      </Descriptions>

      <Title level={5}>角色</Title>
      <Radio.Group
        value={user.role}
        options={ROLE_OPTIONS}
        onChange={(e) => onSaveRole(e.target.value)}
        disabled={saving}
      />

      <Divider />

      <Title level={5}>能力授权</Title>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {catalog.map((c) => {
          const isRoleDefault = roleDefaults.has(c.feature_key);
          const checked = isRoleDefault || selected.has(c.feature_key);
          return (
            <div key={c.feature_key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Tooltip title={isRoleDefault ? '来自角色默认,不可取消' : ''}>
                <Checkbox
                  checked={checked}
                  disabled={isRoleDefault}
                  onChange={(e) => handleToggle(c.feature_key, e.target.checked)}
                >
                  <span style={{ fontWeight: 600 }}>{c.label}</span>
                  <span style={{ color: '#999', marginLeft: 8 }}>({c.feature_key})</span>
                </Checkbox>
              </Tooltip>
              {!isRoleDefault && selected.has(c.feature_key) && (
                <DatePicker
                  placeholder="过期时间(留空=永久)"
                  value={selected.get(c.feature_key) ?? null}
                  onChange={(d) => handleExpiresChange(c.feature_key, d)}
                  showTime
                />
              )}
            </div>
          );
        })}
      </Space>

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <Button type="primary" loading={saving} onClick={onSaveCaps}>
          保存授权
        </Button>
        <Button onClick={() => { window.location.hash = '#/admin/users'; }}>
          返回列表
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 构建冒烟**

```bash
cd frontend && npm run build
```

Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/AdminUserDetail.tsx
git commit -m "feat(m1): AdminUserDetail page with role + capability editor"
```

---

## Task 16: 拼装 admin 路由到 `App.tsx`

**目标:** 把 Task 14/15 两个组件接进 Task 12 里的占位符。

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 引入组件**

顶部 imports 追加:

```ts
import AdminUsers from './pages/AdminUsers';
import AdminUserDetailPage from './pages/AdminUserDetail';
```

- [ ] **Step 2: 替换占位**

把 Task 12 里的占位 div 改为:

```tsx
{route.page === 'admin-users' && <AdminUsers />}
{route.page === 'admin-user-detail' && (
  route.id
    ? <AdminUserDetailPage userId={route.id} />
    : <div>用户 ID 无效</div>
)}
```

- [ ] **Step 3: 构建冒烟**

```bash
cd frontend && npm run build
```

Expected: 成功。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat(m1): wire AdminUsers + AdminUserDetail into App.tsx"
```

---

## Task 17: 集成验证 + PROGRESS.md 勾单

**目标:** 手工冒烟联调清单;更新 PROGRESS.md;merge 条件到位。

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: 启动本地双端**

```bash
# 终端 1
cd backend && uvicorn main:app --reload --port 8000
# 终端 2
cd frontend && npm run dev
```

- [ ] **Step 2: 走一遍手工验收清单**

在浏览器依次完成:

1. 登录 founder 账号(若 db 干净,先 register `founder` 用户并用 SQL / migration 脚本或 admin UI 升级)
2. 看到左侧出现"系统管理"菜单
3. 进 `/admin/users` → 列表能渲染,能按 role 过滤
4. 任选一个非 founder 用户点"详情"
5. 在详情页把角色从 `junior_consultant` 改到 `senior_consultant`(不刷新直接生效)
6. 再改回 `junior_consultant`
7. 手动勾上"流水分析",留空过期时间,保存 → 提示"权限已保存"
8. 退出登录,用刚授权那个账号重新登录 → 左侧菜单出现"流水分析"
9. 用 founder 再进详情,取消勾选"流水分析",保存
10. 那个账号刷新页面 → "流水分析"菜单消失
11. 给该账号勾上"流水分析"但过期时间设为"1 分钟后",保存
12. 该账号登录后能看见菜单,1 分钟后刷新页面 → 菜单消失
13. 用 junior 账号访问 `/admin/users` URL → 后端返回 403 且前端菜单不可见
14. 意向池选一个客户点"详情" → 返回客户池 → 默认"全部"tab 能看见该客户 ✅
15. 菜单"客户" label 已改为"客户池"

每项通过后勾 ✅。任何一项失败 → 回溯对应 Task 修复后再来。

- [ ] **Step 3: 全量后端测试**

```bash
cd backend && pytest
```

Expected: **全绿,0 失败**。

- [ ] **Step 4: 前端 build 通过**

```bash
cd frontend && npm run build
```

Expected: 成功。

- [ ] **Step 5: 更新 `docs/PROGRESS.md`**

把"M1 权限引擎 + Founder 后台 V1"行的状态改为:

```
| **M1 权限引擎 + Founder 后台 V1** | ✅ [spec](...) | ✅ [plan](superpowers/plans/2026-04-19-m1-permission-and-founder-admin.md) | ✅ | ⏳ | 待部署上线 |
```

并更新"当前焦点":

```
**阶段:** M1 实现完成,待上线;M2 plan 撰写中
**分支:** `claude/permission-founder-admin`
**下一步:** M1 部署到生产 → 写 M2 plan → 实现 M2
```

在"生产部署"章节追加上线笔记占位(留空 commit hash,上线时填):

```
- **M1 上线步骤:**
  1. 备份 `finance.db` 到 `/root/finance.db.backup-m1`
  2. 拉代码:`git pull origin claude/permission-founder-admin`(或 merge 到 main)
  3. 跑迁移:`cd /opt/qiyefuwu/backend && python -m scripts.migrate_roles_m1`
  4. 重启:`systemctl restart qiyefuwu`
  5. 前端:`cd /opt/qiyefuwu/frontend && npm ci && npm run build`
  6. 联调:founder 账号登录查 /admin/users 能打开
- **上线 commit hash:** (待填)
```

- [ ] **Step 6: 提交 + push**

```bash
git add docs/PROGRESS.md
git commit -m "docs(m1): mark M1 implementation complete, prep deploy"
git push origin claude/permission-founder-admin
```

---

## 验收总清单(对应 spec 第 10 节)

- [ ] 后端单元/集成测试全部通过(`pytest` 0 失败)
- [ ] 迁移脚本 dry-run 正常,数据库分布正确(在 step 2 手工验证,部署时跑)
- [ ] `/api/auth/me` 返回体含 `effective_capabilities`
- [ ] Founder 在 `/admin/users` 能看到用户列表
- [ ] Founder 在 `/admin/users/:id` 能改 role 并立即在该用户下次登录后生效
- [ ] Founder 能 grant/revoke 单项 capability,支持 `expires_at`
- [ ] 前端菜单对 3 角色(junior/senior/founder)均符合权限矩阵
- [ ] 客户池(原"客户")label 改"客户池";Tabs 能切换 5 类;从意向池→详情→返回"全部"tab 能看到
- [ ] `routers/customers.py` / `routers/cases.py` 不再硬编码 `require_role` / `role == "founder"` / `role == "telesales"` / `role == "consultant"`
- [ ] `docs/PROGRESS.md` M1 行勾为"实现 ✅",待上线后补"上线 ✅ + commit hash"

---

## 回滚预案

若 M1 合并后出现问题:

1. 前端:`git revert <merge-commit>` + `npm run build`
2. 后端:重启旧版本 image / 旧 commit
3. 数据库:
   - `user_capabilities` 表留着(数据无害)
   - 运行 `python -m scripts.migrate_roles_m1_rollback` 把 role 恢复到旧枚举
4. 若连数据库备份都要用:`cp /root/finance.db.backup-m1 /opt/qiyefuwu/backend/data/finance.db`
