from datetime import datetime, timedelta

from services.customer_signal import CustomerSignalInput, CustomerSignalService


def test_signal_new_lead_defaults_yellow():
    result = CustomerSignalService.calculate(CustomerSignalInput())

    assert result.signal_color == "yellow"
    assert result.signal_reason_code == "new_lead"


def test_signal_high_intent_lead_green():
    result = CustomerSignalService.calculate(CustomerSignalInput(intent_level=5))

    assert result.signal_color == "green"
    assert result.signal_reason_code == "high_intent"


def test_signal_overdue_followup_red():
    result = CustomerSignalService.calculate(
        CustomerSignalInput(next_follow_up_at=datetime.utcnow() - timedelta(days=1))
    )

    assert result.signal_color == "red"
    assert result.signal_reason_code == "followup_overdue"


def test_signal_closed_success_green():
    result = CustomerSignalService.calculate(
        CustomerSignalInput(pool="closed", close_result="success")
    )

    assert result.signal_color == "green"
    assert result.signal_reason_code == "closed_success"


def test_customer_flow_recalculates_signal(api_client, telesales_headers):
    created = api_client.post(
        "/api/customers",
        headers=telesales_headers,
        json={"name": "信号测试", "stage": "lead", "intent_level": 2},
    )
    assert created.status_code == 200, created.text
    customer = created.json()
    assert customer["signal_color"] == "yellow"
    assert customer["signal_reason_code"] == "low_intent"

    followed = api_client.post(
        f"/api/customers/{customer['id']}/interactions",
        headers=telesales_headers,
        json={"channel": "phone", "content": "已约到店", "intent_level_after": 5},
    )
    assert followed.status_code == 200, followed.text

    after_followup = api_client.get(f"/api/customers/{customer['id']}", headers=telesales_headers).json()
    assert after_followup["signal_color"] == "green"
    assert after_followup["signal_reason_code"] == "high_intent"

    moved = api_client.put(
        f"/api/customers/{customer['id']}",
        headers=telesales_headers,
        json={"pool": "closed", "close_result": "no_response"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["signal_color"] == "red"
    assert moved.json()["signal_reason_code"] == "closed_no_response"
