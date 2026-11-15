from agent import run_agent
from fake_llm import FakeLLM, call, say

handoffs = []


def get_claim_status(claim_id):
    if claim_id == "CLM-0000":
        raise LookupError("claim not found")
    return {"status": "under survey", "surveyor": "Rajesh Patil"}


def handoff_to_human(reason):
    handoffs.append(reason)
    return {"ticket": "HUM-311", "queue": "claims-pune"}


REGISTRY = {
    "get_claim_status": {
        "description": "Get the status of a motor claim.",
        "schema": {
            "type": "object",
            "properties": {"claim_id": {"type": "string", "pattern": "^CLM-[0-9]+$"}},
            "required": ["claim_id"],
            "additionalProperties": False,
        },
        "fn": get_claim_status,
    },
    "handoff_to_human": {
        "description": "Pass the chat to a human claims officer.",
        "schema": {"type": "object", "properties": {"reason": {"type": "string"}}, "required": ["reason"]},
        "fn": handoff_to_human,
        "terminal": True,
    },
}


def test_model_sees_error_and_fixes_its_call():
    def fix_after_error(messages):
        last = messages[-1]
        assert last["role"] == "tool" and last["is_error"] is True
        assert "does not match pattern" in last["content"]
        return call("get_claim_status", {"claim_id": "CLM-1042"}, "call_2")

    llm = FakeLLM([
        call("get_claim_status", {"claim_id": "CLM 1042"}),
        fix_after_error,
        say("Your claim is under survey with Rajesh Patil."),
    ])
    result = run_agent(llm, "Where is my claim CLM 1042?", REGISTRY)
    assert result["stopped"] == "answer"
    assert result["steps"] == 3


def test_tool_exception_is_fed_back():
    llm = FakeLLM([call("get_claim_status", {"claim_id": "CLM-0000"}), say("I could not find that claim.")])
    result = run_agent(llm, "CLM-0000?", REGISTRY)
    assert result["answer"] == "I could not find that claim."
    assert llm.calls[1]["messages"][-1]["content"] == "LookupError: claim not found"


def test_same_failing_call_twice_is_stuck():
    llm = FakeLLM([
        call("get_claim_status", {"claim_id": "1042"}, "call_1"),
        call("get_claim_status", {"claim_id": "1042"}, "call_2"),
        say("never reached"),
    ])
    result = run_agent(llm, "claim 1042", REGISTRY)
    assert result["stopped"] == "stuck"
    assert result["answer"] is None
    assert result["steps"] == 2
    assert result["messages"][-1]["tool_call_id"] == "call_2"
    assert len(llm.calls) == 2


def test_different_failures_are_not_stuck():
    llm = FakeLLM([
        call("get_claim_status", {"claim_id": "1042"}, "call_1"),
        call("get_claim_status", {"claim_id": "CLM-0000"}, "call_2"),
        call("get_claim_status", {"claim_id": "CLM-1042"}, "call_3"),
        say("Under survey."),
    ])
    assert run_agent(llm, "claim", REGISTRY)["stopped"] == "answer"


def test_repeated_successful_call_is_not_stuck():
    llm = FakeLLM([
        call("get_claim_status", {"claim_id": "CLM-1042"}, "call_1"),
        call("get_claim_status", {"claim_id": "CLM-1042"}, "call_2"),
        say("Still under survey."),
    ])
    assert run_agent(llm, "claim", REGISTRY)["stopped"] == "answer"


def test_terminal_tool_hands_off():
    handoffs.clear()
    llm = FakeLLM([call("handoff_to_human", {"reason": "customer is upset about a delay"}), say("never reached")])
    result = run_agent(llm, "I want to talk to a person", REGISTRY)
    assert result["stopped"] == "handoff"
    assert result["answer"] is None
    assert result["steps"] == 1
    assert handoffs == ["customer is upset about a delay"]
    assert result["messages"][-1]["role"] == "tool"


def test_failed_terminal_call_does_not_hand_off():
    handoffs.clear()
    llm = FakeLLM([call("handoff_to_human", {}), call("handoff_to_human", {"reason": "angry"}, "call_2"), say("x")])
    result = run_agent(llm, "human please", REGISTRY)
    assert result["stopped"] == "handoff"
    assert result["steps"] == 2
    assert handoffs == ["angry"]


def test_step_limit_still_works():
    llm = FakeLLM([call("get_claim_status", {"claim_id": "CLM-1042"}, f"call_{n}") for n in range(6)])
    result = run_agent(llm, "loop", REGISTRY, max_steps=4)
    assert result["stopped"] == "max_steps"
    assert len(llm.calls) == 4
