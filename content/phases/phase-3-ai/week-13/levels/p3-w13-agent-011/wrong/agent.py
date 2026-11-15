from approval import needs_approval
from dispatcher import dispatch

SYSTEM = "You are a refund assistant for a Bengaluru e-commerce company."


# Common mistake: the "pause" only logs a warning and runs the refund anyway.
def start(llm, user_message, registry, max_steps=6):
    state = {"status": "running", "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_message}],
             "pending": None, "answer": None, "steps": 0, "max_steps": max_steps}
    specs = [{"name": n, "description": t["description"], "input_schema": t["schema"]} for n, t in registry.items()]
    while state["steps"] < max_steps:
        reply = llm.complete(state["messages"], tools=specs)
        state["steps"] += 1
        state["messages"].append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
        if not reply["tool_calls"]:
            state.update(status="done", answer=reply["content"])
            return state
        for tool_call in reply["tool_calls"]:
            if needs_approval(tool_call):
                print("warning: large refund", tool_call)
            state["messages"].append(dispatch(tool_call, registry))
    state["status"] = "max_steps"
    return state


def resume(state, decision, llm, registry):
    return state
