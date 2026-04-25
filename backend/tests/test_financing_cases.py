"""PR #3: V1 financing case backend skeleton tests."""


def _create_customer(api_client, headers, name="案件客户"):
    response = api_client.post(
        "/api/customers",
        headers=headers,
        json={"name": name, "stage": "consulting", "intent_level": 4},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _create_case(api_client, headers, customer_id, title="周转贷申请"):
    response = api_client.post(
        f"/api/customers/{customer_id}/financing-cases",
        headers=headers,
        json={
            "title": title,
            "loan_purpose": "经营周转",
            "target_amount": 800000,
            "target_term_months": 24,
            "urgency_level": "normal",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_minimum_financing_case_flow(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    assert case["customer_id"] == customer["id"]
    assert case["case_no"].startswith("YSR-")
    assert case["status"] == "draft"

    detail = api_client.get(f"/api/financing-cases/{case['id']}", headers=consultant_headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["title"] == "周转贷申请"

    moved = api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "in_progress", "change_reason": "资料已初步收齐"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["status"] == "in_progress"

    logs = api_client.get(f"/api/financing-cases/{case['id']}/status-logs", headers=consultant_headers)
    assert logs.status_code == 200, logs.text
    assert len(logs.json()) == 1
    assert logs.json()[0]["from_status"] == "draft"
    assert logs.json()[0]["to_status"] == "in_progress"


def test_list_financing_cases_filters_by_customer_and_status(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])
    api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "in_progress"},
    )

    response = api_client.get(
        f"/api/financing-cases?customer_id={customer['id']}&status=in_progress",
        headers=consultant_headers,
    )
    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()] == [case["id"]]


def test_illegal_status_transition_is_rejected(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    response = api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "submitted"},
    )
    assert response.status_code == 400
    assert "非法案件状态流转" in response.json()["error"]["message"]


def test_close_requires_close_result(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])
    api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "in_progress"},
    )

    missing = api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "closed"},
    )
    assert missing.status_code == 400

    closed = api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "closed", "close_result": "withdrawn"},
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed"
    assert closed.json()["close_result"] == "withdrawn"
    assert closed.json()["closed_at"] is not None


def test_non_closed_status_rejects_close_result(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    response = api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "in_progress", "close_result": "success"},
    )
    assert response.status_code == 400


def test_unauthorized_user_cannot_access_other_case(api_client, consultant_headers, telesales_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    detail = api_client.get(f"/api/financing-cases/{case['id']}", headers=telesales_headers)
    assert detail.status_code == 403

    update = api_client.patch(
        f"/api/financing-cases/{case['id']}",
        headers=telesales_headers,
        json={"title": "越权修改"},
    )
    assert update.status_code == 403


def test_founder_can_access_all_cases(api_client, founder_headers, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    response = api_client.get(f"/api/financing-cases/{case['id']}", headers=founder_headers)
    assert response.status_code == 200, response.text
    assert response.json()["id"] == case["id"]


def test_manager_can_access_team_cases(api_client, consultant_headers):
    from db.database import SessionLocal, Team, User
    from services.auth import create_access_token

    db = SessionLocal()
    team = Team(name="融资一组")
    manager = User(
        username="manager_u",
        hashed_password="not-used",
        display_name="manager_u",
        role="manager",
        team=team,
    )
    consultant = db.query(User).filter(User.username == "consultant_u").first()
    consultant.team = team
    db.add(manager)
    db.commit()
    db.refresh(manager)
    manager_headers = {"Authorization": f"Bearer {create_access_token(manager.id, manager.username)}"}
    db.close()

    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    response = api_client.get(f"/api/financing-cases/{case['id']}", headers=manager_headers)
    assert response.status_code == 200, response.text
    assert response.json()["id"] == case["id"]
