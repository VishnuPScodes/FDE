import json

from agent import run_agent
from fake_llm import FakeLLM, call, say

CLAIMS = {"CLM-1042": {"status": "approved", "amount_inr": 38500}}


def get_claim_status(claim_id):
    return CLAIMS[claim_id]


REGISTRY = {
    "get_claim_status": {
        "description": "Get the status and amount of a motor claim by claim id.",
        "schema": {
            "type": "object",
            "properties": {"claim_id": {"type": "string", "pattern": "^CLM-[0-9]+$"}},
            "required": ["claim_id"],
            "additionalProperties": False,
        },
        "fn": get_claim_status,
    }
}


def test_tool_then_answer():
    llm = FakeLLM([
        call("get_claim_status", {"claim_id": "CLM-1042"}),
        say("Your claim CLM-1042 is approved for ₹38,500."),
    ])
    result = run_agent(llm, "What happened to claim CLM-1042?", REGISTRY)
    assert result["stopped"] == "answer"
    assert result["answer"] == "Your claim CLM-1042 is approved for ₹38,500."
    assert result["steps"] == 2
    assert len(llm.calls) == 2


def test_model_sees_its_request_then_the_result():
    llm = FakeLLM([call("get_claim_status", {"claim_id": "CLM-1042"}), say("Approved.")])
    run_agent(llm, "Status of CLM-1042?", REGISTRY)
    second = llm.calls[1]["messages"]
    assert [m["role"] for m in second] == ["system", "user", "assistant", "tool"]
    assert second[2]["tool_calls"][0]["name"] == "get_claim_status"
    assert second[3]["tool_call_id"] == "call_1"
    assert json.loads(second[3]["content"])["status"] == "approved"


def test_tools_are_described_to_the_model():
    llm = FakeLLM([say("Hello! How can I help with your claim?")])
    result = run_agent(llm, "hi", REGISTRY)
    assert llm.calls[0]["tools"] == [{
        "name": "get_claim_status",
        "description": REGISTRY["get_claim_status"]["description"],
        "input_schema": REGISTRY["get_claim_status"]["schema"],
    }]
    assert result["steps"] == 1
    assert result["messages"][-1] == {"role": "assistant", "content": "Hello! How can I help with your claim?", "tool_calls": []}


def test_step_limit_stops_a_looping_model():
    llm = FakeLLM([call("get_claim_status", {"claim_id": "CLM-1042"}, f"call_{n}") for n in range(10)])
    result = run_agent(llm, "Keep checking", REGISTRY, max_steps=3)
    assert result == {"answer": None, "stopped": "max_steps", "steps": 3, "messages": result["messages"]}
    assert len(llm.calls) == 3
