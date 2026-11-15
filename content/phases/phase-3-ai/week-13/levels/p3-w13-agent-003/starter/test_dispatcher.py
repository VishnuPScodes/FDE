import json

from dispatcher import dispatch

LEDGERS = {"Sharma Traders": 48250, "Kulkarni Steel": -12000}
calls_made = []


def get_ledger_balance(ledger):
    calls_made.append(ledger)
    if ledger not in LEDGERS:
        raise ValueError("ledger not found")
    return {"ledger": ledger, "balance_inr": LEDGERS[ledger], "currency": "₹"}


def list_vouchers(ledger, limit=5):
    return []


LEDGER_SCHEMA = {
    "type": "object",
    "properties": {"ledger": {"type": "string"}},
    "required": ["ledger"],
    "additionalProperties": False,
}
REGISTRY = {
    "get_ledger_balance": {"schema": LEDGER_SCHEMA, "fn": get_ledger_balance},
    "list_vouchers": {"schema": {"type": "object", "properties": {}}, "fn": list_vouchers},
}


def run(name, arguments, call_id="call_7"):
    return dispatch({"id": call_id, "name": name, "arguments": arguments}, REGISTRY)


def test_success_returns_json_content():
    message = run("get_ledger_balance", {"ledger": "Sharma Traders"})
    assert message["role"] == "tool"
    assert message["tool_call_id"] == "call_7"
    assert message["is_error"] is False
    assert json.loads(message["content"]) == {"ledger": "Sharma Traders", "balance_inr": 48250, "currency": "₹"}
    assert "₹" in message["content"]


def test_unknown_tool_lists_available_tools():
    message = run("send_sms", {})
    assert message["is_error"] is True
    assert message["content"] == "unknown tool: send_sms. Available tools: get_ledger_balance, list_vouchers"


def test_string_arguments_are_parsed():
    message = run("get_ledger_balance", '{"ledger": "Kulkarni Steel"}')
    assert message["is_error"] is False
    assert json.loads(message["content"])["balance_inr"] == -12000


def test_bad_json_arguments():
    message = run("get_ledger_balance", '{"ledger": ')
    assert message == {"role": "tool", "tool_call_id": "call_7", "content": "arguments are not valid JSON", "is_error": True}


def test_invalid_arguments_do_not_run_the_tool():
    calls_made.clear()
    message = run("get_ledger_balance", {"ledger": "Sharma Traders", "year": 2025})
    assert message["is_error"] is True
    assert message["content"] == "invalid arguments: unexpected field: year"
    assert calls_made == []


def test_tool_exception_becomes_error_message():
    message = run("get_ledger_balance", {"ledger": "Unknown Pvt Ltd"})
    assert message["is_error"] is True
    assert message["content"] == "ValueError: ledger not found"
