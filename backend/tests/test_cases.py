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
