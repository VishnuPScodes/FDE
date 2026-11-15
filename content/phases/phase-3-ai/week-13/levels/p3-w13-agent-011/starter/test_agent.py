import json

import pytest

from agent import resume, start
from fake_llm import FakeLLM, call, say

refunds = []


def refund_payment(order_id, amount_inr):
    refunds.append(amount_inr)
    return {"order_id": order_id, "status": "refund queued"}


REGISTRY = {
    "refund_payment": {
        "description": "Refund an order. Large refunds need approval.",
        "schema": {"type": "object", "properties": {
            "order_id": {"type": "string"}, "amount_inr": {"type": "integer"}},
            "required": ["order_id", "amount_inr"]},
        "fn": refund_payment,
    }
}


def saved(state):
    """Simulate saving the state to a database and loading it later."""
    return json.loads(json.dumps(state))


def test_small_refund_runs_without_pause():
    refunds.clear()
    llm = FakeLLM([call("refund_payment", {"order_id": "ORD-71", "amount_inr": 1_800}), say("Refund of ₹1,800 queued.")])
    state = start(llm, "Refund my late order ORD-71", REGISTRY)
    assert state["status"] == "done"
    assert state["answer"] == "Refund of ₹1,800 queued."
    assert refunds == [1_800]


def test_large_refund_pauses_before_running():
    refunds.clear()
    llm = FakeLLM([call("refund_payment", {"order_id": "ORD-99", "amount_inr": 24_000}), say("never yet")])
    state = start(llm, "My ₹24,000 phone arrived broken", REGISTRY)
    assert state["status"] == "awaiting_approval"
    assert state["pending"]["arguments"]["amount_inr"] == 24_000
    assert refunds == []
    assert len(llm.calls) == 1
    assert saved(state) == state


def test_approved_refund_runs_after_resume():
    refunds.clear()
    llm = FakeLLM([call("refund_payment", {"order_id": "ORD-99", "amount_inr": 24_000}), say("Approved and queued.")])
    state = saved(start(llm, "Broken phone", REGISTRY))
    state = resume(state, {"approved": True, "reviewer": "Priya", "note": "photos checked"}, llm, REGISTRY)
    assert state["status"] == "done"
    assert state["answer"] == "Approved and queued."
    assert state["pending"] is None
    assert refunds == [24_000]
    assert state["steps"] == 2


def test_denied_refund_is_explained_to_the_model():
    refunds.clear()

    def explain(messages):
        assert messages[-1]["role"] == "tool"
        assert messages[-1]["is_error"] is True
        assert messages[-1]["content"] == "denied by reviewer Rajesh: needs a pickup first"
        return say("A supervisor needs the item picked up first. I have booked a pickup.")

    llm = FakeLLM([call("refund_payment", {"order_id": "ORD-99", "amount_inr": 24_000}), explain])
    state = saved(start(llm, "Broken phone", REGISTRY))
    state = resume(state, {"approved": False, "reviewer": "Rajesh", "note": "needs a pickup first"}, llm, REGISTRY)
    assert state["status"] == "done"
    assert refunds == []


def test_cannot_resume_a_finished_state():
    llm = FakeLLM([say("Hello")])
    state = start(llm, "hi", REGISTRY)
    with pytest.raises(ValueError):
        resume(state, {"approved": True, "reviewer": "Priya", "note": ""}, llm, REGISTRY)


def test_step_limit_counts_across_the_pause():
    llm = FakeLLM([
        call("refund_payment", {"order_id": "ORD-99", "amount_inr": 24_000}),
        call("refund_payment", {"order_id": "ORD-98", "amount_inr": 500}, "call_2"),
        say("never reached"),
    ])
    state = saved(start(llm, "refund", REGISTRY, max_steps=2))
    state = resume(state, {"approved": True, "reviewer": "Priya", "note": ""}, llm, REGISTRY)
    assert state["status"] == "max_steps"
    assert state["steps"] == 2
    assert len(llm.calls) == 2
