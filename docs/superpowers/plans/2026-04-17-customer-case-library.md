# 客户管理与案例库 MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现客户漏斗（电销意向→接待→成交）+ 案例库（含审核工作流）MVP，3-4 周内沉淀 50 条种子案例。

**Architecture:** 后端 FastAPI 新增 2 个 router（customers / cases）+ 权限中间件；前端新增 6 个页面 + 基于 role 的菜单过滤；三张新表（customers / customer_interactions / cases）+ users.role 字段扩展。

**Tech Stack:** Python + FastAPI + SQLAlchemy + SQLite + pytest；React + TypeScript + Vite + Ant Design 5；JWT 认证。

**Spec:** `docs/superpowers/specs/2026-04-17-customer-case-library-design.md`

---

## 目录

- [Phase 1：后端基础](#phase-1后端基础) —— Task 1-6
- [Phase 2：前端页面](#phase-2前端页面) —— Task 7-13
- [Phase 3：集成与部署](#phase-3集成与部署) —— Task 14-16

---

## 文件结构

### 新增文件

**后端**
- `backend/services/permissions.py` —— `require_role` 依赖项
- `backend/routers/customers.py` —— 客户漏斗 API
- `backend/routers/cases.py` —— 案例库 API
- `backend/scripts/migrate_case_library.py` —— 数据库迁移
- `backend/tests/test_customers.py` —— 客户 API 测试
- `backend/tests/test_cases.py` —— 案例 API 测试

**前端**
- `frontend/src/types/customer.ts` —— 客户相关 TS 类型
- `frontend/src/types/case.ts` —— 案例相关 TS 类型
- `frontend/src/pages/Leads.tsx` —— 意向池页面
- `frontend/src/pages/Customers.tsx` —— 客户列表页
- `frontend/src/pages/CustomerDetail.tsx` —— 客户详情页
- `frontend/src/pages/Cases.tsx` —— 案例库列表页
- `frontend/src/pages/CaseForm.tsx` —— 案例录入/编辑表单
- `frontend/src/components/CustomerStageTag.tsx` —— 阶段标签
- `frontend/src/components/CaseStatusTag.tsx` —— 案例状态标签
- `frontend/src/components/InteractionTimeline.tsx` —— 跟进时间线

### 修改文件

- `backend/db/database.py` —— 新增 3 个模型 + `User.role` 字段
- `backend/main.py` —— 注册 2 个新 router
- `backend/tests/conftest.py` —— 新增 auth fixtures
- `frontend/src/services/api.ts` —— 新增 Customer/Case 相关 API 函数
- `frontend/src/App.tsx` —— PageKey 扩展 + 菜单按 role 过滤

---

## 开发约定

- 所有后端修改先写测试再写实现（TDD）
- 每个 Task 完成后立即 commit，不攒
- 所有新 API 端点都需要 `Depends(get_current_user)`
- 所有涉及角色的端点用 `Depends(require_role(...))` 校验
- 前端所有新页面用 `ErrorBoundary` 包裹
- 测试用例用中文命名（匹配现有风格）

---

## Phase 1：后端基础

### Task 1：数据库模型扩展

**Files:**
- Modify: `backend/db/database.py`

- [ ] **Step 1.1：在 `User` 模型里添加 `role` 字段**

在 `backend/db/database.py` 的 `User` 类定义里，在 `is_active` 行之后插入：

```python
    role = Column(String, default="consultant")  # founder / consultant / telesales
```

- [ ] **Step 1.2：在文件末尾 `init_db()` 函数之前添加 3 个新模型**

```python
class Customer(Base):
    """客户主档：含电销意向/谈单接待/成交全阶段，字段逐步补齐"""
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    name = Column(String, nullable=False)
    phone = Column(String, index=True, nullable=True)
    company_name = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    company_size = Column(String, nullable=True)
    source = Column(String, nullable=True)

    stage = Column(String, default="lead")
    intent_level = Column(Integer, default=3)
    target_amount = Column(Float, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)

    company_age = Column(Integer, nullable=True)
    monthly_cashflow = Column(Float, nullable=True)
    has_tax_record = Column(Boolean, nullable=True)
    collateral_type = Column(String, nullable=True)
    collateral_value = Column(Float, nullable=True)
    credit_status = Column(String, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    interactions = relationship("CustomerInteraction", back_populates="customer", cascade="all, delete-orphan")
    cases = relationship("Case", back_populates="customer")


class CustomerInteraction(Base):
    """客户跟进记录：电话/微信/到店等每次联系的记录"""
    __tablename__ = "customer_interactions"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    channel = Column(String)
    content = Column(Text)
    intent_level_after = Column(Integer, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="interactions")


class Case(Base):
    """案例库：种子库（创始人审核发布）是 MVP 核心输出"""
    __tablename__ = "cases"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    narrative = Column(Text, nullable=False)

    industry = Column(String)
    company_size = Column(String, nullable=True)
    company_age = Column(Integer, nullable=True)
    credit_status = Column(String, nullable=True)
    monthly_cashflow = Column(Float, nullable=True)
    has_tax_record = Column(Boolean, nullable=True)
    collateral_type = Column(String, nullable=True)
    collateral_value = Column(Float, nullable=True)

    visit_reason = Column(Text, nullable=True)
    core_problem = Column(Text, nullable=True)
    urgency = Column(String, nullable=True)
    target_amount = Column(Float, nullable=True)

    solution_type = Column(String, nullable=True)
    recommended_bank = Column(String, nullable=True)
    preparation_actions = Column(Text, nullable=True)
    duration_days = Column(Integer, nullable=True)

    outcome = Column(String, nullable=True)
    approved_amount = Column(Float, nullable=True)
    actual_rate = Column(Float, nullable=True)
    bank_tier = Column(String, nullable=True)
    core_lessons = Column(Text, nullable=True)

    status = Column(String, default="draft")
    tier = Column(String, default="seed")
    review_notes = Column(Text, nullable=True)
    published_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="cases")
```

- [ ] **Step 1.3：运行单元测试验证模型定义无语法错误**

Run: `cd backend && python -c "from db.database import Customer, CustomerInteraction, Case, User; print('OK')"`
Expected: `OK` 输出

- [ ] **Step 1.4：Commit**

```bash
cd /Users/renhai2025/Desktop/云上融项目开发
git add backend/db/database.py
git commit -m "feat(db): add Customer/CustomerInteraction/Case models + User.role"
```

---

### Task 2：权限依赖项

**Files:**
- Create: `backend/services/permissions.py`
- Create: `backend/tests/test_permissions.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 2.1：在 conftest.py 末尾添加 auth fixtures**

在 `backend/tests/conftest.py` 末尾追加：

```python
from fastapi.testclient import TestClient

@pytest.fixture
def api_client():
    """Clean API test client with DB reset."""
    from db.database import Base, engine
    from main import app
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _register_and_auth(api_client, username, password="test123", display_name=None):
    r = api_client.post("/api/auth/register", json={
        "username": username,
        "password": password,
        "display_name": display_name or username,
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _set_user_role(username, role):
    from db.database import SessionLocal, User
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    user.role = role
    db.commit()
    db.close()


@pytest.fixture
def founder_headers(api_client):
    token = _register_and_auth(api_client, "founder_u")
    _set_user_role("founder_u", "founder")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def consultant_headers(api_client):
    token = _register_and_auth(api_client, "consultant_u")
    _set_user_role("consultant_u", "consultant")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def telesales_headers(api_client):
    token = _register_and_auth(api_client, "telesales_u")
    _set_user_role("telesales_u", "telesales")
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2.2：写失败测试 `backend/tests/test_permissions.py`**

```python
import pytest
from fastapi import HTTPException
from services.permissions import require_role


class FakeUser:
    def __init__(self, role):
        self.role = role


def test_require_role_single_match():
    dep = require_role("founder")
    assert dep(FakeUser("founder")).role == "founder"


def test_require_role_list_match():
    dep = require_role(["founder", "consultant"])
    assert dep(FakeUser("consultant")).role == "consultant"


def test_require_role_reject():
    dep = require_role("founder")
    with pytest.raises(HTTPException) as exc:
        dep(FakeUser("telesales"))
    assert exc.value.status_code == 403


def test_require_role_case_insensitive():
    dep = require_role("FOUNDER")
    assert dep(FakeUser("founder")).role == "founder"
```

- [ ] **Step 2.3：运行测试验证失败**

Run: `cd backend && pytest tests/test_permissions.py -v`
Expected: FAIL (ModuleNotFoundError: services.permissions)

- [ ] **Step 2.4：实现 `backend/services/permissions.py`**

```python
"""角色权限依赖项：基于当前用户的 role 字段做访问控制。"""

from typing import Union, List
from fastapi import Depends, HTTPException
from db.database import User
from services.auth import get_current_user


def require_role(roles: Union[str, List[str]]):
    """返回一个 FastAPI 依赖项，只有指定角色才能访问端点。

    使用示例：
        @router.post("/admin-only")
        def admin_endpoint(user: User = Depends(require_role("founder"))):
            ...
    """
    if isinstance(roles, str):
        allowed = {roles.lower()}
    else:
        allowed = {r.lower() for r in roles}

    def _dep(current_user: User = Depends(get_current_user)) -> User:
        user_role = (current_user.role or "consultant").lower()
        if user_role not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"需要角色 {sorted(allowed)}，当前 {user_role}",
            )
        return current_user

    return _dep
```

- [ ] **Step 2.5：再跑测试**

Run: `cd backend && pytest tests/test_permissions.py -v`
Expected: 4 PASSED

- [ ] **Step 2.6：Commit**

```bash
git add backend/services/permissions.py backend/tests/test_permissions.py backend/tests/conftest.py
git commit -m "feat(auth): add require_role dependency + test fixtures"
```

---
### Task 3：Customers Router

**Files:**
- Create: `backend/routers/customers.py`
- Create: `backend/tests/test_customers.py`
- Modify: `backend/main.py`

- [ ] **Step 3.1：写失败测试 `backend/tests/test_customers.py`**

```python
"""客户漏斗 API 测试：意向池 / 接待 / 跟进记录 / 分配"""


def test_电销可以录入意向客户(api_client, telesales_headers):
    r = api_client.post("/api/customers", headers=telesales_headers, json={
        "name": "张老板",
        "phone": "13800138000",
        "stage": "lead",
        "intent_level": 4,
        "source": "抖音",
    })
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "lead"
    assert r.json()["intent_level"] == 4


def test_顾问可以录入接待客户(api_client, consultant_headers):
    r = api_client.post("/api/customers", headers=consultant_headers, json={
        "name": "王总",
        "company_name": "某某贸易",
        "stage": "consulting",
        "industry": "贸易",
        "monthly_cashflow": 500000,
    })
    assert r.status_code == 200
    assert r.json()["stage"] == "consulting"


def test_电销不能录入高阶段客户(api_client, telesales_headers):
    r = api_client.post("/api/customers", headers=telesales_headers, json={
        "name": "李总",
        "stage": "consulting",
    })
    assert r.status_code == 403


def test_电销列表只看到自己录入的(api_client, telesales_headers, consultant_headers):
    api_client.post("/api/customers", headers=telesales_headers, json={"name": "A", "stage": "lead"})
    api_client.post("/api/customers", headers=consultant_headers, json={"name": "B", "stage": "consulting"})
    r = api_client.get("/api/customers", headers=telesales_headers)
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert "A" in names
    assert "B" not in names


def test_创始人看到所有客户(api_client, founder_headers, telesales_headers, consultant_headers):
    api_client.post("/api/customers", headers=telesales_headers, json={"name": "A", "stage": "lead"})
    api_client.post("/api/customers", headers=consultant_headers, json={"name": "B", "stage": "consulting"})
    r = api_client.get("/api/customers", headers=founder_headers)
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert "A" in names and "B" in names


def test_按阶段过滤(api_client, founder_headers):
    api_client.post("/api/customers", headers=founder_headers, json={"name": "A", "stage": "lead"})
    api_client.post("/api/customers", headers=founder_headers, json={"name": "B", "stage": "consulting"})
    r = api_client.get("/api/customers?stage=lead", headers=founder_headers)
    names = [c["name"] for c in r.json()]
    assert names == ["A"]


def test_获取客户详情(api_client, consultant_headers):
    cid = api_client.post("/api/customers", headers=consultant_headers, json={"name": "X", "stage": "consulting"}).json()["id"]
    r = api_client.get(f"/api/customers/{cid}", headers=consultant_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "X"


def test_更新客户信息(api_client, consultant_headers):
    cid = api_client.post("/api/customers", headers=consultant_headers, json={"name": "X", "stage": "consulting"}).json()["id"]
    r = api_client.put(f"/api/customers/{cid}", headers=consultant_headers, json={"industry": "餐饮"})
    assert r.status_code == 200
    assert r.json()["industry"] == "餐饮"


def test_电销不能修改别人的客户(api_client, telesales_headers, consultant_headers):
    cid = api_client.post("/api/customers", headers=consultant_headers, json={"name": "X", "stage": "consulting"}).json()["id"]
    r = api_client.put(f"/api/customers/{cid}", headers=telesales_headers, json={"industry": "餐饮"})
    assert r.status_code == 403


def test_添加跟进记录(api_client, telesales_headers):
    cid = api_client.post("/api/customers", headers=telesales_headers, json={"name": "X", "stage": "lead"}).json()["id"]
    r = api_client.post(f"/api/customers/{cid}/interactions", headers=telesales_headers, json={
        "channel": "phone",
        "content": "第一次通话，有融资需求",
        "intent_level_after": 4,
    })
    assert r.status_code == 200
    assert r.json()["intent_level_after"] == 4


def test_跟进记录同步更新客户意向度(api_client, telesales_headers):
    cid = api_client.post("/api/customers", headers=telesales_headers, json={"name": "X", "stage": "lead", "intent_level": 2}).json()["id"]
    api_client.post(f"/api/customers/{cid}/interactions", headers=telesales_headers, json={
        "channel": "phone", "content": "升级为高意向", "intent_level_after": 5,
    })
    r = api_client.get(f"/api/customers/{cid}", headers=telesales_headers)
    assert r.json()["intent_level"] == 5


def test_获取跟进时间线(api_client, telesales_headers):
    cid = api_client.post("/api/customers", headers=telesales_headers, json={"name": "X", "stage": "lead"}).json()["id"]
    api_client.post(f"/api/customers/{cid}/interactions", headers=telesales_headers, json={"channel": "phone", "content": "1"})
    api_client.post(f"/api/customers/{cid}/interactions", headers=telesales_headers, json={"channel": "wechat", "content": "2"})
    r = api_client.get(f"/api/customers/{cid}/interactions", headers=telesales_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_创始人分配客户给顾问(api_client, founder_headers, consultant_headers, telesales_headers):
    cid = api_client.post("/api/customers", headers=telesales_headers, json={"name": "X", "stage": "lead"}).json()["id"]
    from db.database import SessionLocal, User
    db = SessionLocal()
    consultant_id = db.query(User).filter(User.username == "consultant_u").first().id
    db.close()
    r = api_client.post(f"/api/customers/{cid}/assign", headers=founder_headers, json={"assigned_to_id": consultant_id})
    assert r.status_code == 200
    assert r.json()["assigned_to_id"] == consultant_id


def test_顾问不能分配客户(api_client, consultant_headers, telesales_headers):
    cid = api_client.post("/api/customers", headers=telesales_headers, json={"name": "X", "stage": "lead"}).json()["id"]
    r = api_client.post(f"/api/customers/{cid}/assign", headers=consultant_headers, json={"assigned_to_id": 1})
    assert r.status_code == 403


def test_分配后顾问能看到该客户(api_client, founder_headers, consultant_headers, telesales_headers):
    cid = api_client.post("/api/customers", headers=telesales_headers, json={"name": "X", "stage": "lead"}).json()["id"]
    from db.database import SessionLocal, User
    db = SessionLocal()
    consultant_id = db.query(User).filter(User.username == "consultant_u").first().id
    db.close()
    api_client.post(f"/api/customers/{cid}/assign", headers=founder_headers, json={"assigned_to_id": consultant_id})
    r = api_client.get("/api/customers", headers=consultant_headers)
    assert any(c["id"] == cid for c in r.json())
```

- [ ] **Step 3.2：运行测试验证失败**

Run: `cd backend && pytest tests/test_customers.py -v`
Expected: FAIL (router 不存在 / 404)

- [ ] **Step 3.3：实现 `backend/routers/customers.py`**

```python
"""客户漏斗 API：意向池(lead) → 接待(consulting) → 成交(closed_won)。"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db, User, Customer, CustomerInteraction
from services.auth import get_current_user
from services.permissions import require_role

router = APIRouter(prefix="/api/customers", tags=["customers"])


# ---------- Schemas ----------
class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    source: Optional[str] = None
    stage: str = "lead"
    intent_level: int = 3
    target_amount: Optional[float] = None
    next_follow_up_at: Optional[datetime] = None
    company_age: Optional[int] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    credit_status: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    source: Optional[str] = None
    stage: Optional[str] = None
    intent_level: Optional[int] = None
    target_amount: Optional[float] = None
    next_follow_up_at: Optional[datetime] = None
    company_age: Optional[int] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    credit_status: Optional[str] = None
    notes: Optional[str] = None


class CustomerOut(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    company_name: Optional[str]
    industry: Optional[str]
    company_size: Optional[str]
    source: Optional[str]
    stage: str
    intent_level: int
    target_amount: Optional[float]
    next_follow_up_at: Optional[datetime]
    company_age: Optional[int]
    monthly_cashflow: Optional[float]
    has_tax_record: Optional[bool]
    collateral_type: Optional[str]
    collateral_value: Optional[float]
    credit_status: Optional[str]
    notes: Optional[str]
    created_by_id: Optional[int]
    assigned_to_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class InteractionCreate(BaseModel):
    channel: str
    content: str
    intent_level_after: Optional[int] = None
    next_follow_up_at: Optional[datetime] = None


class InteractionOut(BaseModel):
    id: int
    customer_id: int
    channel: str
    content: str
    intent_level_after: Optional[int]
    next_follow_up_at: Optional[datetime]
    created_by_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class AssignBody(BaseModel):
    assigned_to_id: int


# ---------- Helpers ----------
def _can_write_customer(user: User, customer: Customer) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    if customer.created_by_id == user.id or customer.assigned_to_id == user.id:
        return True
    return False


# ---------- Endpoints ----------
@router.post("", response_model=CustomerOut)
def create_customer(
    body: CustomerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    # 电销只能录入 lead 阶段
    if role == "telesales" and body.stage != "lead":
        raise HTTPException(403, "电销只能录入意向(lead)阶段客户")

    customer = Customer(
        user_id=user.id,
        created_by_id=user.id,
        **body.model_dump(),
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=List[CustomerOut])
def list_customers(
    stage: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    q = db.query(Customer)
    if role != "founder":
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
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户")
    return c


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    body: CustomerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c):
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
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c):
        raise HTTPException(403, "无权删除此客户")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/{customer_id}/assign", response_model=CustomerOut)
def assign_customer(
    customer_id: int,
    body: AssignBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    target = db.query(User).filter(User.id == body.assigned_to_id).first()
    if not target:
        raise HTTPException(404, "被分配用户不存在")
    c.assigned_to_id = body.assigned_to_id
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.post("/{customer_id}/interactions", response_model=InteractionOut)
def add_interaction(
    customer_id: int,
    body: InteractionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    if not _can_write_customer(user, c):
        raise HTTPException(403, "无权为此客户添加跟进")
    interaction = CustomerInteraction(
        customer_id=customer_id,
        created_by_id=user.id,
        channel=body.channel,
        content=body.content,
        intent_level_after=body.intent_level_after,
        next_follow_up_at=body.next_follow_up_at,
    )
    db.add(interaction)
    # 同步更新客户主档
    if body.intent_level_after is not None:
        c.intent_level = body.intent_level_after
    if body.next_follow_up_at is not None:
        c.next_follow_up_at = body.next_follow_up_at
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(interaction)
    return interaction


@router.get("/{customer_id}/interactions", response_model=List[InteractionOut])
def list_interactions(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and c.created_by_id != user.id and c.assigned_to_id != user.id:
        raise HTTPException(403, "无权查看此客户跟进")
    return (
        db.query(CustomerInteraction)
        .filter(CustomerInteraction.customer_id == customer_id)
        .order_by(CustomerInteraction.created_at.desc())
        .all()
    )
```

- [ ] **Step 3.4：在 `backend/main.py` 注册 router**

在 `backend/main.py` 现有 `app.include_router(...)` 调用下方追加：

```python
from routers import customers as customers_router
app.include_router(customers_router.router)
```

- [ ] **Step 3.5：跑测试**

Run: `cd backend && pytest tests/test_customers.py -v`
Expected: 15 PASSED

- [ ] **Step 3.6：Commit**

```bash
git add backend/routers/customers.py backend/tests/test_customers.py backend/main.py
git commit -m "feat(customers): add customer funnel CRUD + interactions + assign"
```

---

### Task 4：Cases Router - CRUD

**Files:**
- Create: `backend/routers/cases.py`
- Create: `backend/tests/test_cases.py`
- Modify: `backend/main.py`

- [ ] **Step 4.1：写失败测试 `backend/tests/test_cases.py`（CRUD 部分）**

```python
"""案例库 API 测试：CRUD 部分。工作流测试在下一个任务。"""


def test_顾问可以创建案例草稿(api_client, consultant_headers):
    r = api_client.post("/api/cases", headers=consultant_headers, json={
        "narrative": "某贸易公司，月流水50万，无抵押，3个月放款80万。",
        "industry": "贸易",
        "monthly_cashflow": 500000,
        "outcome": "approved",
        "approved_amount": 800000,
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "draft"
    assert r.json()["tier"] == "seed"


def test_电销不能创建案例(api_client, telesales_headers):
    r = api_client.post("/api/cases", headers=telesales_headers, json={
        "narrative": "test", "industry": "贸易",
    })
    assert r.status_code == 403


def test_创始人创建案例默认草稿(api_client, founder_headers):
    r = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "test case", "industry": "餐饮",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "draft"


def test_创始人可直接发布案例(api_client, founder_headers):
    r = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "高质量案例", "industry": "制造",
        "status": "published",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["published_at"] is not None


def test_顾问不能直接发布案例(api_client, consultant_headers):
    r = api_client.post("/api/cases", headers=consultant_headers, json={
        "narrative": "试图直接发布", "industry": "贸易",
        "status": "published",
    })
    # 顾问提交发布被降级为 draft
    assert r.status_code == 200
    assert r.json()["status"] == "draft"


def test_缺少narrative拒绝(api_client, consultant_headers):
    r = api_client.post("/api/cases", headers=consultant_headers, json={
        "industry": "贸易",
    })
    assert r.status_code == 422


def test_列表只展示自己或已发布(api_client, consultant_headers, founder_headers):
    # 顾问创建一个草稿
    api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "我的草稿", "industry": "A"})
    # 创始人创建一个已发布
    api_client.post("/api/cases", headers=founder_headers, json={"narrative": "已发布", "industry": "B", "status": "published"})
    # 另一个顾问的草稿（模拟）
    from db.database import SessionLocal, Case, User
    db = SessionLocal()
    other = User(username="other_c", hashed_password="x", display_name="o", role="consultant")
    db.add(other); db.commit()
    db.add(Case(narrative="别人的草稿", industry="C", status="draft", user_id=other.id, created_by_id=other.id))
    db.commit()
    db.close()

    r = api_client.get("/api/cases", headers=consultant_headers)
    assert r.status_code == 200
    narratives = [c["narrative"] for c in r.json()]
    assert "我的草稿" in narratives
    assert "已发布" in narratives
    assert "别人的草稿" not in narratives


def test_创始人看到所有案例(api_client, founder_headers, consultant_headers):
    api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "顾问草稿", "industry": "A"})
    r = api_client.get("/api/cases", headers=founder_headers)
    narratives = [c["narrative"] for c in r.json()]
    assert "顾问草稿" in narratives


def test_按行业过滤(api_client, founder_headers):
    api_client.post("/api/cases", headers=founder_headers, json={"narrative": "a", "industry": "餐饮", "status": "published"})
    api_client.post("/api/cases", headers=founder_headers, json={"narrative": "b", "industry": "制造", "status": "published"})
    r = api_client.get("/api/cases?industry=餐饮", headers=founder_headers)
    industries = [c["industry"] for c in r.json()]
    assert industries == ["餐饮"]


def test_按状态过滤(api_client, founder_headers, consultant_headers):
    api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "a", "industry": "A"})
    api_client.post("/api/cases", headers=founder_headers, json={"narrative": "b", "industry": "B", "status": "published"})
    r = api_client.get("/api/cases?status=published", headers=founder_headers)
    assert all(c["status"] == "published" for c in r.json())


def test_获取案例详情(api_client, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    r = api_client.get(f"/api/cases/{cid}", headers=consultant_headers)
    assert r.status_code == 200
    assert r.json()["narrative"] == "x"


def test_顾问看不到别人的草稿详情(api_client, consultant_headers):
    from db.database import SessionLocal, Case, User
    db = SessionLocal()
    other = User(username="other2", hashed_password="x", display_name="o", role="consultant")
    db.add(other); db.commit()
    case = Case(narrative="私密草稿", industry="X", status="draft", user_id=other.id, created_by_id=other.id)
    db.add(case); db.commit()
    cid = case.id
    db.close()
    r = api_client.get(f"/api/cases/{cid}", headers=consultant_headers)
    assert r.status_code == 403


def test_更新自己的草稿(api_client, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    r = api_client.put(f"/api/cases/{cid}", headers=consultant_headers, json={"industry": "B"})
    assert r.status_code == 200
    assert r.json()["industry"] == "B"


def test_不能更新已发布案例_顾问(api_client, consultant_headers, founder_headers):
    cid = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "published", "industry": "A", "status": "published",
    }).json()["id"]
    r = api_client.put(f"/api/cases/{cid}", headers=consultant_headers, json={"industry": "B"})
    assert r.status_code == 403


def test_创始人可更新已发布案例(api_client, founder_headers):
    cid = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "published", "industry": "A", "status": "published",
    }).json()["id"]
    r = api_client.put(f"/api/cases/{cid}", headers=founder_headers, json={"industry": "B"})
    assert r.status_code == 200


def test_删除草稿(api_client, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    r = api_client.delete(f"/api/cases/{cid}", headers=consultant_headers)
    assert r.status_code == 200
    r2 = api_client.get(f"/api/cases/{cid}", headers=consultant_headers)
    assert r2.status_code == 404
```

- [ ] **Step 4.2：运行测试验证失败**

Run: `cd backend && pytest tests/test_cases.py -v`
Expected: FAIL（router 不存在）

- [ ] **Step 4.3：实现 `backend/routers/cases.py`（CRUD 部分，工作流 endpoint 在 Task 5 补）**

```python
"""案例库 API：种子库 MVP。包含 CRUD + 工作流（工作流见 Task 5）。"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db, User, Case
from services.auth import get_current_user
from services.permissions import require_role

router = APIRouter(prefix="/api/cases", tags=["cases"])


# ---------- Schemas ----------
class CaseCreate(BaseModel):
    narrative: str
    customer_id: Optional[int] = None
    industry: str
    company_size: Optional[str] = None
    company_age: Optional[int] = None
    credit_status: Optional[str] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    visit_reason: Optional[str] = None
    core_problem: Optional[str] = None
    urgency: Optional[str] = None
    target_amount: Optional[float] = None
    solution_type: Optional[str] = None
    recommended_bank: Optional[str] = None
    preparation_actions: Optional[str] = None
    duration_days: Optional[int] = None
    outcome: Optional[str] = None
    approved_amount: Optional[float] = None
    actual_rate: Optional[float] = None
    bank_tier: Optional[str] = None
    core_lessons: Optional[str] = None
    status: str = "draft"
    tier: str = "seed"


class CaseUpdate(BaseModel):
    narrative: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    company_age: Optional[int] = None
    credit_status: Optional[str] = None
    monthly_cashflow: Optional[float] = None
    has_tax_record: Optional[bool] = None
    collateral_type: Optional[str] = None
    collateral_value: Optional[float] = None
    visit_reason: Optional[str] = None
    core_problem: Optional[str] = None
    urgency: Optional[str] = None
    target_amount: Optional[float] = None
    solution_type: Optional[str] = None
    recommended_bank: Optional[str] = None
    preparation_actions: Optional[str] = None
    duration_days: Optional[int] = None
    outcome: Optional[str] = None
    approved_amount: Optional[float] = None
    actual_rate: Optional[float] = None
    bank_tier: Optional[str] = None
    core_lessons: Optional[str] = None


class CaseOut(BaseModel):
    id: int
    narrative: str
    customer_id: Optional[int]
    industry: Optional[str]
    company_size: Optional[str]
    company_age: Optional[int]
    credit_status: Optional[str]
    monthly_cashflow: Optional[float]
    has_tax_record: Optional[bool]
    collateral_type: Optional[str]
    collateral_value: Optional[float]
    visit_reason: Optional[str]
    core_problem: Optional[str]
    urgency: Optional[str]
    target_amount: Optional[float]
    solution_type: Optional[str]
    recommended_bank: Optional[str]
    preparation_actions: Optional[str]
    duration_days: Optional[int]
    outcome: Optional[str]
    approved_amount: Optional[float]
    actual_rate: Optional[float]
    bank_tier: Optional[str]
    core_lessons: Optional[str]
    status: str
    tier: str
    review_notes: Optional[str]
    published_at: Optional[datetime]
    created_by_id: Optional[int]
    reviewed_by_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Helpers ----------
def _can_read_case(user: User, case: Case) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    if case.status == "published":
        return True
    return case.created_by_id == user.id


def _can_write_case(user: User, case: Case) -> bool:
    role = (user.role or "consultant").lower()
    if role == "founder":
        return True
    # 顾问只能改自己的草稿
    return case.created_by_id == user.id and case.status in ("draft", "pending_review")


# ---------- Endpoints ----------
@router.post("", response_model=CaseOut)
def create_case(
    body: CaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["founder", "consultant"])),
):
    role = (user.role or "consultant").lower()
    data = body.model_dump()
    # 顾问无法直接发布——降级为草稿
    if role != "founder" and data.get("status") == "published":
        data["status"] = "draft"

    published_at = datetime.utcnow() if data.get("status") == "published" else None
    case = Case(
        user_id=user.id,
        created_by_id=user.id,
        reviewed_by_id=user.id if data.get("status") == "published" else None,
        published_at=published_at,
        **data,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("", response_model=List[CaseOut])
def list_cases(
    status: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = (user.role or "consultant").lower()
    q = db.query(Case)
    if role != "founder":
        q = q.filter(
            (Case.created_by_id == user.id) | (Case.status == "published")
        )
    if status:
        q = q.filter(Case.status == status)
    if industry:
        q = q.filter(Case.industry == industry)
    if tier:
        q = q.filter(Case.tier == tier)
    return q.order_by(Case.created_at.desc()).all()


@router.get("/{case_id}", response_model=CaseOut)
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if not _can_read_case(user, case):
        raise HTTPException(403, "无权查看此案例")
    return case


@router.put("/{case_id}", response_model=CaseOut)
def update_case(
    case_id: int,
    body: CaseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if not _can_write_case(user, case):
        raise HTTPException(403, "无权修改此案例")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(case, k, v)
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.delete("/{case_id}")
def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if not _can_write_case(user, case):
        raise HTTPException(403, "无权删除此案例")
    db.delete(case)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 4.4：在 `backend/main.py` 注册 router**

```python
from routers import cases as cases_router
app.include_router(cases_router.router)
```

- [ ] **Step 4.5：跑测试**

Run: `cd backend && pytest tests/test_cases.py -v`
Expected: 16 PASSED

- [ ] **Step 4.6：Commit**

```bash
git add backend/routers/cases.py backend/tests/test_cases.py backend/main.py
git commit -m "feat(cases): add case library CRUD with role-based visibility"
```

---

### Task 5：Cases Router - 审核工作流

**Files:**
- Modify: `backend/routers/cases.py`
- Modify: `backend/tests/test_cases.py`

- [ ] **Step 5.1：在 `test_cases.py` 末尾追加工作流测试**

```python
# ---------- 工作流测试 ----------

def test_顾问提交草稿进入待审(api_client, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    r = api_client.post(f"/api/cases/{cid}/submit", headers=consultant_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "pending_review"


def test_非草稿不能提交(api_client, founder_headers):
    cid = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "x", "industry": "A", "status": "published",
    }).json()["id"]
    r = api_client.post(f"/api/cases/{cid}/submit", headers=founder_headers)
    assert r.status_code == 400


def test_创始人发布待审案例(api_client, founder_headers, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    api_client.post(f"/api/cases/{cid}/submit", headers=consultant_headers)
    r = api_client.post(f"/api/cases/{cid}/publish", headers=founder_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["published_at"] is not None
    assert r.json()["reviewed_by_id"] is not None


def test_顾问不能发布(api_client, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    api_client.post(f"/api/cases/{cid}/submit", headers=consultant_headers)
    r = api_client.post(f"/api/cases/{cid}/publish", headers=consultant_headers)
    assert r.status_code == 403


def test_创始人打回(api_client, founder_headers, consultant_headers):
    cid = api_client.post("/api/cases", headers=consultant_headers, json={"narrative": "x", "industry": "A"}).json()["id"]
    api_client.post(f"/api/cases/{cid}/submit", headers=consultant_headers)
    r = api_client.post(f"/api/cases/{cid}/reject", headers=founder_headers, json={"review_notes": "信息不全"})
    assert r.status_code == 200
    assert r.json()["status"] == "draft"
    assert r.json()["review_notes"] == "信息不全"


def test_归档已发布案例(api_client, founder_headers):
    cid = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "old", "industry": "A", "status": "published",
    }).json()["id"]
    r = api_client.post(f"/api/cases/{cid}/archive", headers=founder_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


def test_顾问不能归档(api_client, founder_headers, consultant_headers):
    cid = api_client.post("/api/cases", headers=founder_headers, json={
        "narrative": "x", "industry": "A", "status": "published",
    }).json()["id"]
    r = api_client.post(f"/api/cases/{cid}/archive", headers=consultant_headers)
    assert r.status_code == 403
```

- [ ] **Step 5.2：跑测试验证失败**

Run: `cd backend && pytest tests/test_cases.py::test_顾问提交草稿进入待审 -v`
Expected: FAIL (404 /submit 不存在)

- [ ] **Step 5.3：在 `backend/routers/cases.py` 末尾追加工作流端点**

```python
# ---------- 工作流 Schemas ----------
class RejectBody(BaseModel):
    review_notes: str


# ---------- 工作流 Endpoints ----------
@router.post("/{case_id}/submit", response_model=CaseOut)
def submit_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and case.created_by_id != user.id:
        raise HTTPException(403, "无权提交此案例")
    if case.status != "draft":
        raise HTTPException(400, f"案例状态为 {case.status}，无法提交")
    case.status = "pending_review"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/publish", response_model=CaseOut)
def publish_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if case.status not in ("draft", "pending_review"):
        raise HTTPException(400, f"案例状态为 {case.status}，无法发布")
    case.status = "published"
    case.reviewed_by_id = user.id
    case.published_at = datetime.utcnow()
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/reject", response_model=CaseOut)
def reject_case(
    case_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    if case.status != "pending_review":
        raise HTTPException(400, f"案例状态为 {case.status}，无法打回")
    case.status = "draft"
    case.review_notes = body.review_notes
    case.reviewed_by_id = user.id
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/archive", response_model=CaseOut)
def archive_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("founder")),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "案例不存在")
    case.status = "archived"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)
    return case
```

- [ ] **Step 5.4：跑所有 cases 测试**

Run: `cd backend && pytest tests/test_cases.py -v`
Expected: 23 PASSED (16 CRUD + 7 workflow)

- [ ] **Step 5.5：Commit**

```bash
git add backend/routers/cases.py backend/tests/test_cases.py
git commit -m "feat(cases): add submit/publish/reject/archive workflow"
```

---

### Task 6：Cases - 从客户一键生成案例

**Files:**
- Modify: `backend/routers/cases.py`
- Modify: `backend/tests/test_cases.py`

- [ ] **Step 6.1：在 `test_cases.py` 末尾追加测试**

```python
# ---------- 从客户生成案例测试 ----------

def test_从客户一键生成案例草稿(api_client, consultant_headers):
    # 先建一个客户
    cid = api_client.post("/api/customers", headers=consultant_headers, json={
        "name": "王总",
        "stage": "closed_won",
        "industry": "贸易",
        "company_size": "小微",
        "company_age": 3,
        "monthly_cashflow": 500000,
        "target_amount": 800000,
        "credit_status": "良好",
    }).json()["id"]
    # 从客户生成案例
    r = api_client.post(f"/api/cases/from-customer/{cid}", headers=consultant_headers, json={
        "narrative": "王总的融资过程：快速过审。",
        "outcome": "approved",
        "approved_amount": 800000,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "draft"
    assert body["customer_id"] == cid
    assert body["industry"] == "贸易"
    assert body["monthly_cashflow"] == 500000
    assert body["approved_amount"] == 800000


def test_从客户生成案例_没权限的客户(api_client, consultant_headers, founder_headers):
    # 创始人建一个客户不分配
    cid = api_client.post("/api/customers", headers=founder_headers, json={
        "name": "别人的", "stage": "consulting",
    }).json()["id"]
    r = api_client.post(f"/api/cases/from-customer/{cid}", headers=consultant_headers, json={
        "narrative": "偷取",
    })
    assert r.status_code == 403


def test_从不存在的客户生成案例(api_client, consultant_headers):
    r = api_client.post("/api/cases/from-customer/9999", headers=consultant_headers, json={
        "narrative": "x",
    })
    assert r.status_code == 404
```

- [ ] **Step 6.2：跑测试验证失败**

Run: `cd backend && pytest tests/test_cases.py::test_从客户一键生成案例草稿 -v`
Expected: FAIL (404)

- [ ] **Step 6.3：在 `backend/routers/cases.py` 末尾追加端点**

```python
# ---------- 从客户生成案例 ----------
class FromCustomerBody(BaseModel):
    narrative: str
    visit_reason: Optional[str] = None
    core_problem: Optional[str] = None
    urgency: Optional[str] = None
    solution_type: Optional[str] = None
    recommended_bank: Optional[str] = None
    preparation_actions: Optional[str] = None
    duration_days: Optional[int] = None
    outcome: Optional[str] = None
    approved_amount: Optional[float] = None
    actual_rate: Optional[float] = None
    bank_tier: Optional[str] = None
    core_lessons: Optional[str] = None


@router.post("/from-customer/{customer_id}", response_model=CaseOut)
def create_case_from_customer(
    customer_id: int,
    body: FromCustomerBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["founder", "consultant"])),
):
    from db.database import Customer
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(404, "客户不存在")
    role = (user.role or "consultant").lower()
    if role != "founder" and customer.created_by_id != user.id and customer.assigned_to_id != user.id:
        raise HTTPException(403, "无权从该客户生成案例")

    case = Case(
        user_id=user.id,
        created_by_id=user.id,
        customer_id=customer_id,
        narrative=body.narrative,
        industry=customer.industry or "未分类",
        company_size=customer.company_size,
        company_age=customer.company_age,
        credit_status=customer.credit_status,
        monthly_cashflow=customer.monthly_cashflow,
        has_tax_record=customer.has_tax_record,
        collateral_type=customer.collateral_type,
        collateral_value=customer.collateral_value,
        target_amount=customer.target_amount,
        visit_reason=body.visit_reason,
        core_problem=body.core_problem,
        urgency=body.urgency,
        solution_type=body.solution_type,
        recommended_bank=body.recommended_bank,
        preparation_actions=body.preparation_actions,
        duration_days=body.duration_days,
        outcome=body.outcome,
        approved_amount=body.approved_amount,
        actual_rate=body.actual_rate,
        bank_tier=body.bank_tier,
        core_lessons=body.core_lessons,
        status="draft",
        tier="seed",
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case
```

- [ ] **Step 6.4：跑测试**

Run: `cd backend && pytest tests/test_cases.py -v`
Expected: 26 PASSED

- [ ] **Step 6.5：Commit**

```bash
git add backend/routers/cases.py backend/tests/test_cases.py
git commit -m "feat(cases): add from-customer one-click case creation"
```

---

## Phase 2：前端页面

### Task 7：TypeScript 类型 + API 函数

**Files:**
- Create: `frontend/src/types/customer.ts`
- Create: `frontend/src/types/case.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 7.1：创建 `frontend/src/types/customer.ts`**

```typescript
export type CustomerStage =
  | 'lead'
  | 'invited'
  | 'consulting'
  | 'proposal'
  | 'closed_won'
  | 'closed_lost';

export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  company_name?: string | null;
  industry?: string | null;
  company_size?: string | null;
  source?: string | null;
  stage: CustomerStage;
  intent_level: number;
  target_amount?: number | null;
  next_follow_up_at?: string | null;
  company_age?: number | null;
  monthly_cashflow?: number | null;
  has_tax_record?: boolean | null;
  collateral_type?: string | null;
  collateral_value?: number | null;
  credit_status?: string | null;
  notes?: string | null;
  created_by_id?: number | null;
  assigned_to_id?: number | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  company_name?: string;
  industry?: string;
  company_size?: string;
  source?: string;
  stage?: CustomerStage;
  intent_level?: number;
  target_amount?: number;
  next_follow_up_at?: string;
  company_age?: number;
  monthly_cashflow?: number;
  has_tax_record?: boolean;
  collateral_type?: string;
  collateral_value?: number;
  credit_status?: string;
  notes?: string;
}

export type InteractionChannel = 'phone' | 'wechat' | 'visit' | 'other';

export interface CustomerInteraction {
  id: number;
  customer_id: number;
  channel: InteractionChannel;
  content: string;
  intent_level_after?: number | null;
  next_follow_up_at?: string | null;
  created_by_id?: number | null;
  created_at: string;
}

export interface InteractionInput {
  channel: InteractionChannel;
  content: string;
  intent_level_after?: number;
  next_follow_up_at?: string;
}
```

- [ ] **Step 7.2：创建 `frontend/src/types/case.ts`**

```typescript
export type CaseStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type CaseTier = 'seed' | 'growth';

export interface Case {
  id: number;
  narrative: string;
  customer_id?: number | null;
  industry?: string | null;
  company_size?: string | null;
  company_age?: number | null;
  credit_status?: string | null;
  monthly_cashflow?: number | null;
  has_tax_record?: boolean | null;
  collateral_type?: string | null;
  collateral_value?: number | null;
  visit_reason?: string | null;
  core_problem?: string | null;
  urgency?: string | null;
  target_amount?: number | null;
  solution_type?: string | null;
  recommended_bank?: string | null;
  preparation_actions?: string | null;
  duration_days?: number | null;
  outcome?: string | null;
  approved_amount?: number | null;
  actual_rate?: number | null;
  bank_tier?: string | null;
  core_lessons?: string | null;
  status: CaseStatus;
  tier: CaseTier;
  review_notes?: string | null;
  published_at?: string | null;
  created_by_id?: number | null;
  reviewed_by_id?: number | null;
  created_at: string;
}

export interface CaseInput {
  narrative: string;
  customer_id?: number;
  industry: string;
  company_size?: string;
  company_age?: number;
  credit_status?: string;
  monthly_cashflow?: number;
  has_tax_record?: boolean;
  collateral_type?: string;
  collateral_value?: number;
  visit_reason?: string;
  core_problem?: string;
  urgency?: string;
  target_amount?: number;
  solution_type?: string;
  recommended_bank?: string;
  preparation_actions?: string;
  duration_days?: number;
  outcome?: string;
  approved_amount?: number;
  actual_rate?: number;
  bank_tier?: string;
  core_lessons?: string;
  status?: CaseStatus;
}
```

- [ ] **Step 7.3：在 `frontend/src/services/api.ts` 末尾追加 API 函数**

```typescript
import type {
  Customer,
  CustomerInput,
  CustomerInteraction,
  InteractionInput,
} from '../types/customer';
import type { Case, CaseInput } from '../types/case';

// ---------- Customers ----------
export const customersApi = {
  list: (stage?: string) =>
    api.get<Customer[]>('/api/customers', { params: stage ? { stage } : {} }).then(r => r.data),
  get: (id: number) => api.get<Customer>(`/api/customers/${id}`).then(r => r.data),
  create: (body: CustomerInput) =>
    api.post<Customer>('/api/customers', body).then(r => r.data),
  update: (id: number, body: Partial<CustomerInput>) =>
    api.put<Customer>(`/api/customers/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/customers/${id}`).then(r => r.data),
  assign: (id: number, assigned_to_id: number) =>
    api.post<Customer>(`/api/customers/${id}/assign`, { assigned_to_id }).then(r => r.data),
  listInteractions: (id: number) =>
    api.get<CustomerInteraction[]>(`/api/customers/${id}/interactions`).then(r => r.data),
  addInteraction: (id: number, body: InteractionInput) =>
    api.post<CustomerInteraction>(`/api/customers/${id}/interactions`, body).then(r => r.data),
};

// ---------- Cases ----------
export interface CaseListFilters {
  status?: string;
  industry?: string;
  tier?: string;
}

export const casesApi = {
  list: (filters?: CaseListFilters) =>
    api.get<Case[]>('/api/cases', { params: filters || {} }).then(r => r.data),
  get: (id: number) => api.get<Case>(`/api/cases/${id}`).then(r => r.data),
  create: (body: CaseInput) => api.post<Case>('/api/cases', body).then(r => r.data),
  update: (id: number, body: Partial<CaseInput>) =>
    api.put<Case>(`/api/cases/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/cases/${id}`).then(r => r.data),
  submit: (id: number) => api.post<Case>(`/api/cases/${id}/submit`).then(r => r.data),
  publish: (id: number) => api.post<Case>(`/api/cases/${id}/publish`).then(r => r.data),
  reject: (id: number, review_notes: string) =>
    api.post<Case>(`/api/cases/${id}/reject`, { review_notes }).then(r => r.data),
  archive: (id: number) => api.post<Case>(`/api/cases/${id}/archive`).then(r => r.data),
  fromCustomer: (customer_id: number, body: { narrative: string; [k: string]: unknown }) =>
    api.post<Case>(`/api/cases/from-customer/${customer_id}`, body).then(r => r.data),
};
```

**Note:** 如果现有 `api.ts` 中 axios 实例变量名不是 `api`，请替换为实际名称。

- [ ] **Step 7.4：验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 7.5：Commit**

```bash
git add frontend/src/types/customer.ts frontend/src/types/case.ts frontend/src/services/api.ts
git commit -m "feat(frontend): add customer/case types + API client"
```

---

### Task 8：共用组件（标签 + 时间线）

**Files:**
- Create: `frontend/src/components/CustomerStageTag.tsx`
- Create: `frontend/src/components/CaseStatusTag.tsx`
- Create: `frontend/src/components/InteractionTimeline.tsx`

- [ ] **Step 8.1：`CustomerStageTag.tsx`**

```tsx
import { Tag } from 'antd';
import type { CustomerStage } from '../types/customer';

const STAGE_CONFIG: Record<CustomerStage, { color: string; label: string }> = {
  lead: { color: 'default', label: '意向' },
  invited: { color: 'blue', label: '已邀约' },
  consulting: { color: 'cyan', label: '接待中' },
  proposal: { color: 'orange', label: '方案中' },
  closed_won: { color: 'green', label: '已成交' },
  closed_lost: { color: 'red', label: '已流失' },
};

export default function CustomerStageTag({ stage }: { stage: CustomerStage }) {
  const cfg = STAGE_CONFIG[stage] || { color: 'default', label: stage };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}
```

- [ ] **Step 8.2：`CaseStatusTag.tsx`**

```tsx
import { Tag } from 'antd';
import type { CaseStatus } from '../types/case';

const STATUS_CONFIG: Record<CaseStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  pending_review: { color: 'orange', label: '待审核' },
  published: { color: 'green', label: '已发布' },
  archived: { color: 'red', label: '已归档' },
};

export default function CaseStatusTag({ status }: { status: CaseStatus }) {
  const cfg = STATUS_CONFIG[status] || { color: 'default', label: status };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}
```

- [ ] **Step 8.3：`InteractionTimeline.tsx`**

```tsx
import { Timeline, Empty, Tag } from 'antd';
import type { CustomerInteraction, InteractionChannel } from '../types/customer';

const CHANNEL_LABEL: Record<InteractionChannel, string> = {
  phone: '电话',
  wechat: '微信',
  visit: '到店',
  other: '其他',
};

function formatDate(s: string) {
  return new Date(s).toLocaleString('zh-CN');
}

export default function InteractionTimeline({
  items,
}: {
  items: CustomerInteraction[];
}) {
  if (!items.length) return <Empty description="暂无跟进" />;
  return (
    <Timeline
      items={items.map(item => ({
        children: (
          <div>
            <div>
              <Tag>{CHANNEL_LABEL[item.channel] || item.channel}</Tag>
              <span style={{ color: '#888', fontSize: 12 }}>
                {formatDate(item.created_at)}
              </span>
              {item.intent_level_after != null && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  意向度 {item.intent_level_after}
                </Tag>
              )}
            </div>
            <div style={{ marginTop: 4 }}>{item.content}</div>
          </div>
        ),
      }))}
    />
  );
}
```

- [ ] **Step 8.4：Commit**

```bash
git add frontend/src/components/CustomerStageTag.tsx frontend/src/components/CaseStatusTag.tsx frontend/src/components/InteractionTimeline.tsx
git commit -m "feat(frontend): add customer/case shared components"
```

---

### Task 9：Leads 页面（意向池）

**Files:**
- Create: `frontend/src/pages/Leads.tsx`

- [ ] **Step 9.1：创建 `frontend/src/pages/Leads.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Space, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { customersApi } from '../services/api';
import type { Customer, CustomerInput } from '../types/customer';
import CustomerStageTag from '../components/CustomerStageTag';
import ErrorBoundary from '../components/ErrorBoundary';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CustomerInput>();

  const refresh = async () => {
    setLoading(true);
    try {
      setLeads(await customersApi.list('lead'));
    } catch (e: unknown) {
      message.error('加载意向池失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await customersApi.create({ ...values, stage: 'lead' });
      message.success('新增成功');
      form.resetFields();
      setModalOpen(false);
      refresh();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('新增失败');
    }
  };

  return (
    <ErrorBoundary>
      <Card
        title="意向池"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增意向客户
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={leads}
          columns={[
            { title: '姓名', dataIndex: 'name' },
            { title: '电话', dataIndex: 'phone' },
            { title: '公司', dataIndex: 'company_name' },
            { title: '来源', dataIndex: 'source' },
            { title: '意向度', dataIndex: 'intent_level', render: v => `★ ${v}` },
            { title: '阶段', dataIndex: 'stage', render: s => <CustomerStageTag stage={s} /> },
            {
              title: '下次跟进',
              dataIndex: 'next_follow_up_at',
              render: v => (v ? new Date(v).toLocaleDateString('zh-CN') : '-'),
            },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => location.hash = `#/customers/${row.id}`}>详情</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新增意向客户"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        okText="保存"
        cancelText="取消"
      >
        <Form layout="vertical" form={form} initialValues={{ intent_level: 3 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="company_name" label="公司名称">
            <Input />
          </Form.Item>
          <Form.Item name="source" label="来源">
            <Select options={[
              { label: '抖音', value: '抖音' },
              { label: '朋友介绍', value: '朋友介绍' },
              { label: '搜索', value: '搜索' },
              { label: '其他', value: '其他' },
            ]} />
          </Form.Item>
          <Form.Item name="intent_level" label="意向度 (1-5)">
            <InputNumber min={1} max={5} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </ErrorBoundary>
  );
}
```

**Note:** 如果 `ErrorBoundary` 路径不同，请替换为实际路径。如果没有 ErrorBoundary，可以暂时删除包裹。

- [ ] **Step 9.2：Commit**

```bash
git add frontend/src/pages/Leads.tsx
git commit -m "feat(frontend): add Leads (intent pool) page"
```

---

### Task 10：Customers 页面（我的客户/全部客户）

**Files:**
- Create: `frontend/src/pages/Customers.tsx`

- [ ] **Step 10.1：创建 `frontend/src/pages/Customers.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, Switch, message, Card, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { customersApi } from '../services/api';
import type { Customer, CustomerInput, CustomerStage } from '../types/customer';
import CustomerStageTag from '../components/CustomerStageTag';
import ErrorBoundary from '../components/ErrorBoundary';

const STAGE_OPTIONS: { label: string; value: CustomerStage }[] = [
  { label: '已邀约', value: 'invited' },
  { label: '接待中', value: 'consulting' },
  { label: '方案中', value: 'proposal' },
  { label: '已成交', value: 'closed_won' },
  { label: '已流失', value: 'closed_lost' },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CustomerInput>();

  const refresh = async () => {
    setLoading(true);
    try {
      setCustomers(await customersApi.list(stageFilter));
    } catch {
      message.error('加载客户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [stageFilter]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await customersApi.create(values);
      message.success('新增成功');
      form.resetFields();
      setModalOpen(false);
      refresh();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('新增失败');
    }
  };

  // 接待入口专用：展示非 lead 阶段
  const visible = customers.filter(c => c.stage !== 'lead');

  return (
    <ErrorBoundary>
      <Card
        title="我的客户"
        extra={
          <Space>
            <Select
              allowClear placeholder="按阶段筛选" style={{ width: 140 }}
              value={stageFilter} onChange={setStageFilter}
              options={STAGE_OPTIONS}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              新增接待客户
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={visible}
          columns={[
            { title: '姓名', dataIndex: 'name' },
            { title: '公司', dataIndex: 'company_name' },
            { title: '行业', dataIndex: 'industry' },
            { title: '月流水', dataIndex: 'monthly_cashflow', render: v => v ? `¥${Number(v).toLocaleString()}` : '-' },
            { title: '目标额度', dataIndex: 'target_amount', render: v => v ? `¥${Number(v).toLocaleString()}` : '-' },
            { title: '阶段', dataIndex: 'stage', render: s => <CustomerStageTag stage={s} /> },
            {
              title: '操作',
              render: (_, row) => (
                <Button size="small" onClick={() => location.hash = `#/customers/${row.id}`}>详情</Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新增接待客户"
        open={modalOpen}
        width={720}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        okText="保存" cancelText="取消"
      >
        <Form layout="vertical" form={form} initialValues={{ stage: 'consulting', intent_level: 4 }}>
          <Form.Item name="name" label="联系人" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="company_name" label="公司名称">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="stage" label="阶段">
            <Select options={STAGE_OPTIONS} />
          </Form.Item>
          <Form.Item name="industry" label="行业">
            <Input />
          </Form.Item>
          <Form.Item name="company_size" label="企业规模">
            <Select options={[
              { label: '个体', value: '个体' },
              { label: '小微', value: '小微' },
              { label: '中型', value: '中型' },
            ]} />
          </Form.Item>
          <Form.Item name="company_age" label="成立年限">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="monthly_cashflow" label="月流水 (元)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="has_tax_record" label="有纳税记录" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="collateral_type" label="抵押物类型">
            <Select allowClear options={[
              { label: '无', value: '无' },
              { label: '房产', value: '房产' },
              { label: '车辆', value: '车辆' },
              { label: '设备', value: '设备' },
            ]} />
          </Form.Item>
          <Form.Item name="target_amount" label="目标额度 (元)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 10.2：Commit**

```bash
git add frontend/src/pages/Customers.tsx
git commit -m "feat(frontend): add Customers page (consulting funnel)"
```

---

### Task 11：CustomerDetail 页面（含跟进时间线）

**Files:**
- Create: `frontend/src/pages/CustomerDetail.tsx`

- [ ] **Step 11.1：创建 `frontend/src/pages/CustomerDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Card, Descriptions, Button, Modal, Form, Select, Input, InputNumber, message, Row, Col, Space } from 'antd';
import { customersApi, casesApi } from '../services/api';
import type { Customer, CustomerInteraction, InteractionInput } from '../types/customer';
import CustomerStageTag from '../components/CustomerStageTag';
import InteractionTimeline from '../components/InteractionTimeline';
import ErrorBoundary from '../components/ErrorBoundary';

export default function CustomerDetailPage({ customerId }: { customerId: number }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<CustomerInteraction[]>([]);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [iForm] = Form.useForm<InteractionInput>();
  const [cForm] = Form.useForm<{ narrative: string; outcome?: string; approved_amount?: number }>();

  const refresh = async () => {
    try {
      const [c, is] = await Promise.all([
        customersApi.get(customerId),
        customersApi.listInteractions(customerId),
      ]);
      setCustomer(c);
      setInteractions(is);
    } catch {
      message.error('加载失败');
    }
  };

  useEffect(() => { refresh(); }, [customerId]);

  const addInteraction = async () => {
    try {
      const v = await iForm.validateFields();
      await customersApi.addInteraction(customerId, v);
      message.success('跟进已记录');
      iForm.resetFields();
      setInteractionOpen(false);
      refresh();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('失败');
    }
  };

  const createCase = async () => {
    try {
      const v = await cForm.validateFields();
      await casesApi.fromCustomer(customerId, v);
      message.success('案例草稿已生成，请到案例库完善');
      cForm.resetFields();
      setCaseOpen(false);
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('失败');
    }
  };

  if (!customer) return <Card loading />;

  return (
    <ErrorBoundary>
      <Row gutter={16}>
        <Col span={14}>
          <Card
            title={<Space>{customer.name} <CustomerStageTag stage={customer.stage} /></Space>}
            extra={
              <Space>
                <Button onClick={() => setInteractionOpen(true)}>添加跟进</Button>
                {(customer.stage === 'closed_won' || customer.stage === 'closed_lost') && (
                  <Button type="primary" onClick={() => setCaseOpen(true)}>
                    生成案例
                  </Button>
                )}
              </Space>
            }
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="电话">{customer.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="公司">{customer.company_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="行业">{customer.industry || '-'}</Descriptions.Item>
              <Descriptions.Item label="规模">{customer.company_size || '-'}</Descriptions.Item>
              <Descriptions.Item label="意向度">★ {customer.intent_level}</Descriptions.Item>
              <Descriptions.Item label="来源">{customer.source || '-'}</Descriptions.Item>
              <Descriptions.Item label="月流水">
                {customer.monthly_cashflow ? `¥${Number(customer.monthly_cashflow).toLocaleString()}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标额度">
                {customer.target_amount ? `¥${Number(customer.target_amount).toLocaleString()}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="抵押物">{customer.collateral_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="征信">{customer.credit_status || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{customer.notes || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="跟进记录">
            <InteractionTimeline items={interactions} />
          </Card>
        </Col>
      </Row>

      <Modal title="添加跟进" open={interactionOpen} onCancel={() => setInteractionOpen(false)} onOk={addInteraction}>
        <Form layout="vertical" form={iForm}>
          <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
            <Select options={[
              { label: '电话', value: 'phone' },
              { label: '微信', value: 'wechat' },
              { label: '到店', value: 'visit' },
              { label: '其他', value: 'other' },
            ]} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="intent_level_after" label="更新意向度">
            <InputNumber min={1} max={5} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="从客户生成案例" open={caseOpen} onCancel={() => setCaseOpen(false)} onOk={createCase} width={600}>
        <Form layout="vertical" form={cForm}>
          <Form.Item
            name="narrative"
            label="案例叙述（至少 200 字，讲清客户背景、问题、方案、结果）"
            rules={[{ required: true, min: 50 }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="outcome" label="结果">
            <Select options={[
              { label: '已批', value: 'approved' },
              { label: '被拒', value: 'rejected' },
              { label: '客户放弃', value: 'abandoned' },
            ]} />
          </Form.Item>
          <Form.Item name="approved_amount" label="批款额度（若已批）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 11.2：Commit**

```bash
git add frontend/src/pages/CustomerDetail.tsx
git commit -m "feat(frontend): add CustomerDetail with interactions + case generation"
```

---

### Task 12：Cases 列表页（含筛选 + 审核操作）

**Files:**
- Create: `frontend/src/pages/Cases.tsx`

- [ ] **Step 12.1：创建 `frontend/src/pages/Cases.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Card, Table, Button, Select, Space, Tag, Modal, Input, message, Drawer, Descriptions, Popconfirm } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { casesApi } from '../services/api';
import type { Case, CaseStatus } from '../types/case';
import CaseStatusTag from '../components/CaseStatusTag';
import ErrorBoundary from '../components/ErrorBoundary';

export default function CasesPage({ role }: { role: string }) {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | undefined>();
  const [industryFilter, setIndustryFilter] = useState<string | undefined>();
  const [drawerCase, setDrawerCase] = useState<Case | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setCases(await casesApi.list({ status: statusFilter, industry: industryFilter }));
    } catch {
      message.error('加载案例失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [statusFilter, industryFilter]);

  const isFounder = role === 'founder';

  const submit = async (id: number) => {
    try { await casesApi.submit(id); message.success('已提交'); refresh(); }
    catch { message.error('提交失败'); }
  };
  const publish = async (id: number) => {
    try { await casesApi.publish(id); message.success('已发布'); refresh(); }
    catch { message.error('发布失败'); }
  };
  const archive = async (id: number) => {
    try { await casesApi.archive(id); message.success('已归档'); refresh(); }
    catch { message.error('归档失败'); }
  };
  const openReject = (id: number) => { setRejectTarget(id); setRejectNotes(''); setRejectOpen(true); };
  const confirmReject = async () => {
    if (!rejectTarget || !rejectNotes) { message.warning('请填写意见'); return; }
    try {
      await casesApi.reject(rejectTarget, rejectNotes);
      message.success('已打回');
      setRejectOpen(false);
      refresh();
    } catch { message.error('操作失败'); }
  };
  const remove = async (id: number) => {
    try { await casesApi.remove(id); message.success('已删除'); refresh(); }
    catch { message.error('删除失败'); }
  };

  return (
    <ErrorBoundary>
      <Card
        title="案例库"
        extra={
          <Space>
            <Select
              allowClear placeholder="状态" style={{ width: 120 }}
              value={statusFilter} onChange={setStatusFilter}
              options={[
                { label: '草稿', value: 'draft' },
                { label: '待审核', value: 'pending_review' },
                { label: '已发布', value: 'published' },
                { label: '已归档', value: 'archived' },
              ]}
            />
            <Input
              allowClear placeholder="按行业过滤" style={{ width: 160 }}
              value={industryFilter}
              onChange={e => setIndustryFilter(e.target.value || undefined)}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => location.hash = '#/cases/new'}>
              新增案例
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={cases}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 70 },
            {
              title: '叙述',
              dataIndex: 'narrative',
              render: (v: string) => v.slice(0, 60) + (v.length > 60 ? '...' : ''),
            },
            { title: '行业', dataIndex: 'industry' },
            { title: '结果', dataIndex: 'outcome', render: v => v ? <Tag>{v}</Tag> : '-' },
            { title: '状态', dataIndex: 'status', render: s => <CaseStatusTag status={s} /> },
            { title: '层级', dataIndex: 'tier' },
            {
              title: '操作',
              width: 280,
              render: (_, row) => (
                <Space wrap>
                  <Button size="small" onClick={() => setDrawerCase(row)}>查看</Button>
                  {row.status === 'draft' && (
                    <>
                      <Button size="small" onClick={() => location.hash = `#/cases/${row.id}/edit`}>编辑</Button>
                      <Button size="small" type="primary" onClick={() => submit(row.id)}>提交审核</Button>
                      <Popconfirm title="确定删除？" onConfirm={() => remove(row.id)}>
                        <Button size="small" danger>删除</Button>
                      </Popconfirm>
                    </>
                  )}
                  {isFounder && row.status === 'pending_review' && (
                    <>
                      <Button size="small" type="primary" onClick={() => publish(row.id)}>发布</Button>
                      <Button size="small" onClick={() => openReject(row.id)}>打回</Button>
                    </>
                  )}
                  {isFounder && row.status === 'published' && (
                    <Button size="small" danger onClick={() => archive(row.id)}>归档</Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={drawerCase ? `案例 #${drawerCase.id}` : ''}
        width={640}
        open={!!drawerCase}
        onClose={() => setDrawerCase(null)}
      >
        {drawerCase && (
          <>
            <p style={{ whiteSpace: 'pre-wrap' }}>{drawerCase.narrative}</p>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="行业">{drawerCase.industry}</Descriptions.Item>
              <Descriptions.Item label="规模">{drawerCase.company_size || '-'}</Descriptions.Item>
              <Descriptions.Item label="月流水">{drawerCase.monthly_cashflow || '-'}</Descriptions.Item>
              <Descriptions.Item label="征信">{drawerCase.credit_status || '-'}</Descriptions.Item>
              <Descriptions.Item label="抵押物">{drawerCase.collateral_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="目标额度">{drawerCase.target_amount || '-'}</Descriptions.Item>
              <Descriptions.Item label="方案类型">{drawerCase.solution_type || '-'}</Descriptions.Item>
              <Descriptions.Item label="推荐银行">{drawerCase.recommended_bank || '-'}</Descriptions.Item>
              <Descriptions.Item label="结果">{drawerCase.outcome || '-'}</Descriptions.Item>
              <Descriptions.Item label="批款">{drawerCase.approved_amount || '-'}</Descriptions.Item>
              <Descriptions.Item label="实际利率">{drawerCase.actual_rate || '-'}</Descriptions.Item>
              <Descriptions.Item label="银行层级">{drawerCase.bank_tier || '-'}</Descriptions.Item>
              <Descriptions.Item label="核心经验" span={2}>{drawerCase.core_lessons || '-'}</Descriptions.Item>
              {drawerCase.review_notes && (
                <Descriptions.Item label="审核意见" span={2}>{drawerCase.review_notes}</Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Drawer>

      <Modal title="打回案例" open={rejectOpen} onCancel={() => setRejectOpen(false)} onOk={confirmReject}>
        <Input.TextArea
          rows={4}
          placeholder="请写清打回原因"
          value={rejectNotes}
          onChange={e => setRejectNotes(e.target.value)}
        />
      </Modal>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 12.2：Commit**

```bash
git add frontend/src/pages/Cases.tsx
git commit -m "feat(frontend): add Cases list page with review actions"
```

---

### Task 13：CaseForm 页面（录入/编辑）

**Files:**
- Create: `frontend/src/pages/CaseForm.tsx`

- [ ] **Step 13.1：创建 `frontend/src/pages/CaseForm.tsx`**

```tsx
import { useEffect } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, message, Switch, Row, Col, Space } from 'antd';
import { casesApi } from '../services/api';
import type { CaseInput } from '../types/case';
import ErrorBoundary from '../components/ErrorBoundary';

export default function CaseFormPage({ caseId }: { caseId?: number }) {
  const [form] = Form.useForm<CaseInput>();
  const isEdit = !!caseId;

  useEffect(() => {
    if (!caseId) return;
    casesApi.get(caseId).then(c => form.setFieldsValue(c as unknown as CaseInput));
  }, [caseId]);

  const submit = async (publish: boolean) => {
    try {
      const v = await form.validateFields();
      if (isEdit) {
        await casesApi.update(caseId!, v);
        if (publish) await casesApi.submit(caseId!);
      } else {
        const created = await casesApi.create(v);
        if (publish) await casesApi.submit(created.id);
      }
      message.success(publish ? '已提交审核' : '已保存');
      location.hash = '#/cases';
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error('保存失败');
    }
  };

  return (
    <ErrorBoundary>
      <Card
        title={isEdit ? '编辑案例' : '新增案例'}
        extra={
          <Space>
            <Button onClick={() => submit(false)}>保存草稿</Button>
            <Button type="primary" onClick={() => submit(true)}>提交审核</Button>
          </Space>
        }
      >
        <Form layout="vertical" form={form}>
          {/* 核心叙述 */}
          <Form.Item
            name="narrative"
            label="案例叙述（向量化的主料：讲清客户背景、来访原因、核心问题、方案、结果、核心经验）"
            rules={[{ required: true, min: 100, message: '至少 100 字' }]}
          >
            <Input.TextArea rows={10} />
          </Form.Item>

          <h3>一、客户画像</h3>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="industry" label="行业" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="company_size" label="规模"><Select options={[
              { label: '个体', value: '个体' }, { label: '小微', value: '小微' }, { label: '中型', value: '中型' },
            ]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="company_age" label="成立年限"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="credit_status" label="征信"><Select options={[
              { label: '良好', value: '良好' }, { label: '有瑕疵', value: '有瑕疵' }, { label: '不良', value: '不良' },
            ]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="monthly_cashflow" label="月流水 (元)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="has_tax_record" label="有纳税" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="collateral_type" label="抵押物类型"><Select allowClear options={[
              { label: '无', value: '无' }, { label: '房产', value: '房产' }, { label: '车辆', value: '车辆' }, { label: '设备', value: '设备' },
            ]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="collateral_value" label="抵押物估值"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>

          <h3>二、来访诉求</h3>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="visit_reason" label="来访原因"><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="core_problem" label="核心问题"><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="urgency" label="紧迫度"><Select options={[
              { label: '紧急', value: '紧急' }, { label: '一般', value: '一般' }, { label: '不急', value: '不急' },
            ]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="target_amount" label="目标额度"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>

          <h3>三、方案</h3>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="solution_type" label="方案类型"><Input placeholder="如：抵押贷 / 信用贷 / 组合" /></Form.Item></Col>
            <Col span={8}><Form.Item name="recommended_bank" label="推荐银行"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="duration_days" label="耗时（天）"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={24}><Form.Item name="preparation_actions" label="准备动作/资料"><Input.TextArea rows={3} /></Form.Item></Col>
          </Row>

          <h3>四、结果</h3>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="outcome" label="结果"><Select options={[
              { label: '已批', value: 'approved' },
              { label: '被拒', value: 'rejected' },
              { label: '客户放弃', value: 'abandoned' },
            ]} /></Form.Item></Col>
            <Col span={8}><Form.Item name="approved_amount" label="批款额度"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="actual_rate" label="实际利率 (%)"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="bank_tier" label="银行层级"><Select options={[
              { label: '国有大行', value: '国有大行' }, { label: '股份制', value: '股份制' }, { label: '城商行', value: '城商行' },
            ]} /></Form.Item></Col>
            <Col span={24}><Form.Item name="core_lessons" label="核心经验（可重用的判断/话术）"><Input.TextArea rows={3} /></Form.Item></Col>
          </Row>
        </Form>
      </Card>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 13.2：Commit**

```bash
git add frontend/src/pages/CaseForm.tsx
git commit -m "feat(frontend): add CaseForm page (create + edit)"
```

---

## Phase 3：集成与部署

### Task 14：App.tsx 路由 + 角色菜单

**Files:**
- Modify: `frontend/src/App.tsx`

前提：当前 App.tsx 已用 hash 路由（如 `#/credit-analysis`）和 Ant Design 侧边栏。此 Task 要把新页面接入，并根据 JWT 里的 user.role 过滤菜单。

- [ ] **Step 14.1：读取现有 `frontend/src/App.tsx` 定位以下元素**

Run: `grep -n "PageKey\|MenuItem\|useAuth\|role" frontend/src/App.tsx`
Expected: 找到 PageKey 类型定义、menu items 数组、当前用户 hook

- [ ] **Step 14.2：扩展 PageKey 类型**

在 PageKey 联合类型定义里增加以下成员：

```typescript
  | 'leads'
  | 'customers'
  | 'customer-detail'
  | 'cases'
  | 'case-new'
  | 'case-edit'
```

- [ ] **Step 14.3：在菜单数组 items 里追加 5 条（按 role 过滤）**

```typescript
import type { MenuProps } from 'antd';

// 假设有 const role = currentUser?.role || 'consultant';

const allItems: (MenuProps['items'][number] & { roles?: string[] })[] = [
  // ...现有菜单保留...
  { key: 'leads', label: '意向池', roles: ['founder', 'telesales'] },
  { key: 'customers', label: '客户', roles: ['founder', 'consultant'] },
  { key: 'cases', label: '案例库', roles: ['founder', 'consultant'] },
];

const menuItems = allItems.filter(
  it => !it.roles || it.roles.includes(role),
);
```

- [ ] **Step 14.4：在路由 switch/render 区块添加新页面**

```tsx
import LeadsPage from './pages/Leads';
import CustomersPage from './pages/Customers';
import CustomerDetailPage from './pages/CustomerDetail';
import CasesPage from './pages/Cases';
import CaseFormPage from './pages/CaseForm';

// 在渲染逻辑里：
function renderPage() {
  const hash = window.location.hash; // 已有的 hash 解析保留
  if (pageKey === 'leads') return <LeadsPage />;
  if (pageKey === 'customers') return <CustomersPage />;
  if (pageKey === 'customer-detail') {
    const id = Number(hash.match(/#\/customers\/(\d+)/)?.[1]);
    return id ? <CustomerDetailPage customerId={id} /> : <div>客户 ID 无效</div>;
  }
  if (pageKey === 'cases') return <CasesPage role={role} />;
  if (pageKey === 'case-new') return <CaseFormPage />;
  if (pageKey === 'case-edit') {
    const id = Number(hash.match(/#\/cases\/(\d+)\/edit/)?.[1]);
    return id ? <CaseFormPage caseId={id} /> : <div>案例 ID 无效</div>;
  }
  // ...现有分支保留...
}
```

- [ ] **Step 14.5：在 hash 解析逻辑里添加新路由匹配**

```typescript
// 假设已有 hashchange 监听，识别 pageKey
if (/^#\/customers\/\d+/.test(hash)) setPageKey('customer-detail');
else if (hash === '#/leads') setPageKey('leads');
else if (hash === '#/customers') setPageKey('customers');
else if (hash === '#/cases') setPageKey('cases');
else if (hash === '#/cases/new') setPageKey('case-new');
else if (/^#\/cases\/\d+\/edit/.test(hash)) setPageKey('case-edit');
```

- [ ] **Step 14.6：确认菜单 onClick 更新 hash**

```typescript
onClick={({ key }) => {
  if (key === 'leads') window.location.hash = '#/leads';
  else if (key === 'customers') window.location.hash = '#/customers';
  else if (key === 'cases') window.location.hash = '#/cases';
  // ...其余保留
}}
```

- [ ] **Step 14.7：验证编译 + 手动点击 3 个菜单**

Run:
```bash
cd frontend && npm run build
```
Expected: 无 TS 错误

Run dev server 后用 3 种角色分别登录，确认：
- telesales 账号只看到意向池
- consultant 账号看到客户 + 案例库
- founder 账号看到所有 3 项

- [ ] **Step 14.8：Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): route customer/case pages with role-based menu"
```

---

### Task 15：数据库迁移脚本 + 服务器部署

**Files:**
- Create: `backend/scripts/migrate_case_library.py`

- [ ] **Step 15.1：创建迁移脚本 `backend/scripts/migrate_case_library.py`**

```python
"""为生产库补齐 Customer/CustomerInteraction/Case 表及 users.role 列。

幂等：多次执行安全。读 SQLite 版本用 ALTER TABLE，不依赖 Alembic。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text
from db.database import engine, Base, Customer, CustomerInteraction, Case  # noqa: F401


def ensure_users_role():
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("users")}
    if "role" in cols:
        print("[skip] users.role already exists")
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'consultant'"))
        conn.execute(text("UPDATE users SET role = 'consultant' WHERE role IS NULL"))
    print("[ok] added users.role")


def ensure_new_tables():
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    needed = {"customers", "customer_interactions", "cases"}
    missing = needed - existing
    if not missing:
        print("[skip] all new tables exist")
        return
    Base.metadata.create_all(bind=engine)
    print(f"[ok] created: {sorted(missing)}")


def main():
    ensure_users_role()
    ensure_new_tables()
    print("Migration complete.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 15.2：本地验证迁移脚本**

Run: `cd backend && python scripts/migrate_case_library.py`
Expected: 第一次执行 `[ok] added users.role` + `[ok] created ...`；再次执行全部 `[skip]`

- [ ] **Step 15.3：本地跑全量测试确保没破坏现有功能**

Run: `cd backend && pytest -v`
Expected: 全绿（或仅 pre-existing 的 skip/xfail）

- [ ] **Step 15.4：推到 GitHub**

```bash
cd /Users/renhai2025/Desktop/云上融项目开发
git push origin main
```

- [ ] **Step 15.5：服务器侧部署**

SSH 到 `101.96.197.130`，以 root 运行：

```bash
cd /opt/qiyefuwu
sudo -u qiyefuwu git pull origin main

# 后端部署
sudo -u qiyefuwu bash -c "cd backend && source venv/bin/activate && pip install -r requirements.txt"
sudo -u qiyefuwu bash -c "cd backend && source venv/bin/activate && python scripts/migrate_case_library.py"

# 把一个初始用户设为 founder（替换 YOUR_USERNAME）
sudo -u qiyefuwu bash -c "cd backend && source venv/bin/activate && python -c \"
from db.database import SessionLocal, User
db = SessionLocal()
u = db.query(User).filter(User.username == 'YOUR_USERNAME').first()
u.role = 'founder'
db.commit()
print('founder set')
\""

# 前端构建 + 部署
cd /opt/qiyefuwu/frontend
sudo -u qiyefuwu bash -c "npm ci && npm run build"
sudo cp -r dist/* /var/www/qiyefuwu/

# 重启后端
sudo systemctl restart qiyefuwu
sudo systemctl status qiyefuwu --no-pager
```

Expected:
- 迁移脚本输出 `Migration complete.`
- `systemctl status` 显示 active (running)
- `curl http://127.0.0.1:8000/api/cases` 返回 401（未登录）而非 404

- [ ] **Step 15.6：Commit 迁移脚本**

```bash
git add backend/scripts/migrate_case_library.py
git commit -m "chore: add idempotent migration for customer/case schema"
git push origin main
```

---

### Task 16：E2E 冒烟验证

**Files:** 无，仅手动验证

- [ ] **Step 16.1：浏览器访问 https://yunshangrong.com （或公网地址）以 founder 账号登录**

预期：菜单显示"意向池 / 客户 / 案例库"三个新项

- [ ] **Step 16.2：意向池流程**

1. 点击"意向池" → "新增意向客户"
2. 填写：姓名=测试客户A、电话=13800000001、来源=抖音、意向度=4
3. 保存 → 列表出现新记录
4. 点击"详情" → 能看到客户卡片

Expected: 所有步骤无报错

- [ ] **Step 16.3：接待 → 生成案例流程**

1. 回到"客户"页，"新增接待客户"
2. 填写：联系人=王总、公司=测试贸易、阶段=已成交、行业=贸易、月流水=500000、目标额度=800000
3. 进入详情 → "添加跟进" 写"首次接洽，需求明确"→ 保存
4. 详情页点"生成案例" → 填写叙述（至少 100 字）+ 结果=已批 + 批款=800000 → 保存
5. 切到"案例库" → 看到这条草稿

Expected: 案例库中出现刚刚生成的草稿，状态=草稿

- [ ] **Step 16.4：审核流程**

1. 在"案例库"找到上一步的草稿 → 点"提交审核"
2. 状态变为"待审核"
3. 作为 founder 点"发布" → 状态变"已发布"

Expected: 状态转换正确，发布后其他账号可见

- [ ] **Step 16.5：权限验证（用 consultant 和 telesales 账号）**

用 consultant 账号登录：
- 能看到客户 + 案例库，看不到意向池

用 telesales 账号登录：
- 能看到意向池，看不到客户 + 案例库
- 尝试直接访问 `#/customers` 时菜单上没有，但 URL 强进可能出现空列表（前端不做硬拦截，后端已拦）

Expected: 菜单过滤正确；后端 API 返回 403 或空列表

- [ ] **Step 16.6：完成声明**

在本地：

```bash
echo "$(date +%F) customer-case-library MVP deployed and verified" >> docs/DEPLOY_LOG.md
git add docs/DEPLOY_LOG.md
git commit -m "docs: log customer-case-library MVP deployment"
git push origin main
```

---

## 执行检查清单

- [ ] Phase 1 完成：`pytest backend/tests/test_customers.py backend/tests/test_cases.py backend/tests/test_permissions.py -v` 全绿
- [ ] Phase 2 完成：`cd frontend && npm run build` 无 TS 错误，3 种角色登录菜单符合预期
- [ ] Phase 3 完成：服务器访问正常，`systemctl status qiyefuwu` 显示 active
- [ ] 至少录入 1 条端到端的测试案例（从客户 → 案例 → 发布）
- [ ] README 或 CHANGELOG 更新一行说明（可选）

