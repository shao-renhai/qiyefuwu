"""PR #4: consent, file metadata, and analysis task skeleton tests."""


def _create_customer(api_client, headers, name="资料客户"):
    response = api_client.post(
        "/api/customers",
        headers=headers,
        json={"name": name, "stage": "consulting", "intent_level": 4},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _create_case(api_client, headers, customer_id):
    response = api_client.post(
        f"/api/customers/{customer_id}/financing-cases",
        headers=headers,
        json={"title": "经营贷资料案件", "target_amount": 500000},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _create_consent(api_client, headers, case_id, consent_type="credit_report"):
    response = api_client.post(
        f"/api/financing-cases/{case_id}/consents",
        headers=headers,
        json={
            "consent_type": consent_type,
            "consent_version": "v1",
            "consent_text_snapshot": "客户授权云上融处理融资资料。",
            "authorized_by_name": "张老板",
            "authorized_by_phone": "13800138000",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_minimum_case_resource_flow(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    denied_file = api_client.post(
        f"/api/financing-cases/{case['id']}/files",
        headers=consultant_headers,
        json={
            "file_type": "credit_report",
            "file_name": "征信报告.pdf",
            "storage_key": "future/credit-report.pdf",
            "mime_type": "application/pdf",
            "file_size": 1024,
            "sensitivity_level": "sensitive",
        },
    )
    assert denied_file.status_code == 403

    consent = _create_consent(api_client, consultant_headers, case["id"])
    assert consent["case_id"] == case["id"]
    assert consent["customer_id"] == customer["id"]
    assert consent["status"] == "active"
    assert consent["consent_text_snapshot"]

    file_response = api_client.post(
        f"/api/financing-cases/{case['id']}/files",
        headers=consultant_headers,
        json={
            "file_type": "credit_report",
            "file_name": "征信报告.pdf",
            "storage_key": "future/credit-report.pdf",
            "mime_type": "application/pdf",
            "file_size": 1024,
            "sensitivity_level": "sensitive",
        },
    )
    assert file_response.status_code == 200, file_response.text
    file = file_response.json()
    assert file["case_id"] == case["id"]
    assert file["customer_id"] == customer["id"]

    task_response = api_client.post(
        f"/api/financing-cases/{case['id']}/analysis-tasks",
        headers=consultant_headers,
        json={"task_type": "credit_analysis", "file_id": file["id"]},
    )
    assert task_response.status_code == 200, task_response.text
    task = task_response.json()
    assert task["status"] == "pending"

    running = api_client.post(
        f"/api/analysis-tasks/{task['id']}/status",
        headers=consultant_headers,
        json={"status": "running"},
    )
    assert running.status_code == 200, running.text
    assert running.json()["started_at"] is not None

    succeeded = api_client.post(
        f"/api/analysis-tasks/{task['id']}/status",
        headers=consultant_headers,
        json={"status": "succeeded"},
    )
    assert succeeded.status_code == 200, succeeded.text
    assert succeeded.json()["finished_at"] is not None

    consents = api_client.get(f"/api/financing-cases/{case['id']}/consents", headers=consultant_headers)
    files = api_client.get(f"/api/financing-cases/{case['id']}/files", headers=consultant_headers)
    tasks = api_client.get(f"/api/financing-cases/{case['id']}/analysis-tasks", headers=consultant_headers)
    assert len(consents.json()) == 1
    assert len(files.json()) == 1
    assert len(tasks.json()) == 1


def test_bank_analysis_task_requires_authorization(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])

    denied = api_client.post(
        f"/api/financing-cases/{case['id']}/analysis-tasks",
        headers=consultant_headers,
        json={"task_type": "bank_statement_analysis"},
    )
    assert denied.status_code == 403

    _create_consent(api_client, consultant_headers, case["id"], consent_type="bank_statement")
    allowed = api_client.post(
        f"/api/financing-cases/{case['id']}/analysis-tasks",
        headers=consultant_headers,
        json={"task_type": "bank_statement_analysis"},
    )
    assert allowed.status_code == 200, allowed.text


def test_voided_consent_no_longer_allows_sensitive_file(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])
    consent = _create_consent(api_client, consultant_headers, case["id"])

    voided = api_client.post(f"/api/consents/{consent['id']}/void", headers=consultant_headers)
    assert voided.status_code == 200, voided.text
    assert voided.json()["status"] == "voided"

    denied = api_client.post(
        f"/api/financing-cases/{case['id']}/files",
        headers=consultant_headers,
        json={
            "file_type": "credit_report",
            "file_name": "征信报告.pdf",
            "storage_key": "future/credit-report.pdf",
            "sensitivity_level": "sensitive",
        },
    )
    assert denied.status_code == 403


def test_closed_case_rejects_new_resources(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    case = _create_case(api_client, consultant_headers, customer["id"])
    api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "in_progress"},
    )
    closed = api_client.post(
        f"/api/financing-cases/{case['id']}/status",
        headers=consultant_headers,
        json={"to_status": "closed", "close_result": "withdrawn"},
    )
    assert closed.status_code == 200, closed.text

    response = api_client.post(
        f"/api/financing-cases/{case['id']}/consents",
        headers=consultant_headers,
        json={
            "consent_type": "credit_report",
            "consent_version": "v1",
            "consent_text_snapshot": "客户授权云上融处理融资资料。",
            "authorized_by_name": "张老板",
        },
    )
    assert response.status_code == 400


def test_file_and_task_must_belong_to_same_case(api_client, consultant_headers):
    customer = _create_customer(api_client, consultant_headers)
    first_case = _create_case(api_client, consultant_headers, customer["id"])
    second_case = _create_case(api_client, consultant_headers, customer["id"])
    _create_consent(api_client, consultant_headers, first_case["id"])
    _create_consent(api_client, consultant_headers, second_case["id"])
    file = api_client.post(
        f"/api/financing-cases/{first_case['id']}/files",
        headers=consultant_headers,
        json={
            "file_type": "credit_report",
            "file_name": "征信报告.pdf",
            "storage_key": "future/credit-report.pdf",
            "sensitivity_level": "sensitive",
        },
    ).json()

    response = api_client.post(
        f"/api/financing-cases/{second_case['id']}/analysis-tasks",
        headers=consultant_headers,
        json={"task_type": "credit_analysis", "file_id": file["id"]},
    )
    assert response.status_code == 400
