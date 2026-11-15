import json

from approval import execute_with_approval, needs_approval

refunds = []


def refund_payment(order_id, amount_inr):
    refunds.append((order_id, amount_inr))
    return {"order_id": order_id, "refunded_inr": amount_inr, "status": "queued"}


def close_account(customer_id):
    return {"closed": customer_id}


def order_status(order_id):
    return {"order_id": order_id, "status": "delivered"}


REGISTRY = {
    "refund_payment": {"schema": {"type": "object", "properties": {
        "order_id": {"type": "string"}, "amount_inr": {"type": "integer"}}}, "fn": refund_payment},
    "close_account": {"schema": {"type": "object", "properties": {"customer_id": {"type": "string"}}}, "fn": close_account},
    "order_status": {"schema": {"type": "object", "properties": {"order_id": {"type": "string"}}}, "fn": order_status},
}


def refund(amount, call_id="call_1"):
    return {"id": call_id, "name": "refund_payment", "arguments": {"order_id": "ORD-5521", "amount_inr": amount}}


def approve(call):
    return {"approved": True, "reviewer": "Priya", "note": "verified damaged item photos"}


def deny(call):
    return {"approved": False, "reviewer": "Rajesh", "note": "second refund this month"}


def broken(call):
    raise ConnectionError("approval service down")


def test_small_refunds_and_reads_need_no_approval():
    assert needs_approval(refund(9_999)) is False
    assert needs_approval({"id": "c", "name": "order_status", "arguments": {"order_id": "ORD-1"}}) is False


def test_exactly_the_limit_needs_no_approval():
    assert needs_approval(refund(10_000)) is False


def test_large_refund_needs_approval():
    assert needs_approval(refund(12_500)) is True


def test_risky_tools_always_need_approval():
    assert needs_approval({"id": "c", "name": "close_account", "arguments": {"customer_id": "CUST-9"}}) is True


def test_unclear_amount_fails_closed():
    assert needs_approval(refund("15000")) is True
    assert needs_approval(refund(True)) is True
    assert needs_approval({"id": "c", "name": "refund_payment", "arguments": {"order_id": "ORD-1"}}) is True


def test_no_approval_runs_and_logs():
    refunds.clear()
    log = []
    message = execute_with_approval(refund(2_000), REGISTRY, deny, log)
    assert message["is_error"] is False
    assert refunds == [("ORD-5521", 2_000)]
    assert log == [{"tool": "refund_payment", "arguments": {"order_id": "ORD-5521", "amount_inr": 2_000},
                    "approval": "not_required", "reviewer": None}]


def test_approved_refund_runs():
    refunds.clear()
    log = []
    message = execute_with_approval(refund(12_500), REGISTRY, approve, log)
    assert json.loads(message["content"])["refunded_inr"] == 12_500
    assert refunds == [("ORD-5521", 12_500)]
    assert log[0]["approval"] == "approved" and log[0]["reviewer"] == "Priya"


def test_denied_refund_never_runs():
    refunds.clear()
    log = []
    message = execute_with_approval(refund(12_500, "call_9"), REGISTRY, deny, log)
    assert refunds == []
    assert message == {"role": "tool", "tool_call_id": "call_9", "is_error": True,
                       "content": "denied by reviewer Rajesh: second refund this month"}
    assert log[0]["approval"] == "denied" and log[0]["reviewer"] == "Rajesh"


def test_broken_or_silent_approver_fails_closed():
    refunds.clear()
    log = []
    first = execute_with_approval(refund(50_000), REGISTRY, broken, log)
    second = execute_with_approval(refund(50_000), REGISTRY, lambda call: None, log)
    assert refunds == []
    assert first["is_error"] and second["is_error"]
    assert first["content"] == "denied by reviewer unknown: "
    assert [entry["approval"] for entry in log] == ["denied", "denied"]
