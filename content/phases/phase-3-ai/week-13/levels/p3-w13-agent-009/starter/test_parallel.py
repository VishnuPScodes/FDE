import json

from agent import run_agent
from fake_llm import FakeLLM, calls, say
from parallel import execute_tool_calls

STOCK = {"Pune": 42, "Kochi": 0}
runs = []


def check_stock(sku, city):
    runs.append(city)
    if city not in STOCK:
        raise TimeoutError(f"{city} warehouse API timed out")
    return {"sku": sku, "city": city, "units": STOCK[city]}


REGISTRY = {
    "check_stock": {
        "description": "Units of a SKU in one city's warehouse.",
        "schema": {
            "type": "object",
            "properties": {"sku": {"type": "string"}, "city": {"type": "string"}},
            "required": ["sku", "city"],
            "additionalProperties": False,
        },
        "fn": check_stock,
    }
}

THREE = [
    {"id": "call_a", "name": "check_stock", "arguments": {"sku": "BTL-750", "city": "Pune"}},
    {"id": "call_b", "name": "check_stock", "arguments": {"sku": "BTL-750", "city": "Kochi"}},
    {"id": "call_c", "name": "check_stock", "arguments": {"sku": "BTL-750", "city": "Delhi"}},
]


def test_one_message_per_call_in_order():
    results = execute_tool_calls(THREE, REGISTRY)
    assert [r["tool_call_id"] for r in results] == ["call_a", "call_b", "call_c"]
    assert all(r["role"] == "tool" for r in results)
    assert json.loads(results[0]["content"])["units"] == 42


def test_one_failure_does_not_block_others():
    results = execute_tool_calls(THREE, REGISTRY)
    assert [r["is_error"] for r in results] == [False, False, True]
    assert results[2]["content"] == "TimeoutError: Delhi warehouse API timed out"


def test_identical_calls_run_once():
    runs.clear()
    same = [
        {"id": "call_1", "name": "check_stock", "arguments": {"sku": "BTL-750", "city": "Pune"}},
        {"id": "call_2", "name": "check_stock", "arguments": {"city": "Pune", "sku": "BTL-750"}},
        {"id": "call_3", "name": "check_stock", "arguments": {"sku": "BTL-750", "city": "Kochi"}},
    ]
    results = execute_tool_calls(same, REGISTRY)
    assert runs == ["Pune", "Kochi"]
    assert [r["tool_call_id"] for r in results] == ["call_1", "call_2", "call_3"]
    assert results[0]["content"] == results[1]["content"]


def test_agent_sends_all_results_before_next_model_call():
    llm = FakeLLM([
        calls(
            ("call_a", "check_stock", {"sku": "BTL-750", "city": "Pune"}),
            ("call_b", "check_stock", {"sku": "BTL-750", "city": "Kochi"}),
            ("call_c", "check_stock", {"sku": "BTL-750", "city": "Delhi"}),
        ),
        say("Pune has 42. Kochi has none. Delhi did not respond, so please check again soon."),
    ])
    result = run_agent(llm, "Steel bottle stock in Pune, Kochi and Delhi?", REGISTRY)
    assert result["stopped"] == "answer"
    roles = [m["role"] for m in llm.calls[1]["messages"]]
    assert roles == ["system", "user", "assistant", "tool", "tool", "tool"]
