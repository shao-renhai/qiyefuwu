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
