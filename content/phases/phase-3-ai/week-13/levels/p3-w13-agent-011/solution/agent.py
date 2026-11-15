from approval import needs_approval
from dispatcher import dispatch

SYSTEM = "You are a refund assistant for a Bengaluru e-commerce company."


def _specs(registry):
    return [{"name": n, "description": t["description"], "input_schema": t["schema"]} for n, t in registry.items()]


def _run(state, llm, registry):
    messages = state["messages"]
    while state["steps"] < state["max_steps"]:
        reply = llm.complete(messages, tools=_specs(registry))
        state["steps"] += 1
        messages.append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
        if not reply["tool_calls"]:
            state["status"] = "done"
            state["answer"] = reply["content"]
            return state
        for tool_call in reply["tool_calls"]:
            if needs_approval(tool_call):
                state["status"] = "awaiting_approval"
                state["pending"] = tool_call
                return state
            messages.append(dispatch(tool_call, registry))
    state["status"] = "max_steps"
    return state


def start(llm, user_message, registry, max_steps=6):
    state = {
        "status": "running",
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_message}],
        "pending": None,
        "answer": None,
        "steps": 0,
        "max_steps": max_steps,
    }
    return _run(state, llm, registry)


def resume(state, decision, llm, registry):
    if state.get("status") != "awaiting_approval" or not state.get("pending"):
        raise ValueError("this state is not waiting for approval")
    pending = state["pending"]
    if decision.get("approved") is True:
        state["messages"].append(dispatch(pending, registry))
    else:
        state["messages"].append({
            "role": "tool",
            "tool_call_id": pending["id"],
            "content": f"denied by reviewer {decision.get('reviewer', 'unknown')}: {decision.get('note', '')}",
            "is_error": True,
        })
    state["pending"] = None
    state["status"] = "running"
    return _run(state, llm, registry)
