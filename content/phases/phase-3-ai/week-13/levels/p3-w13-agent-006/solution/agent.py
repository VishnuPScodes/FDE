import json

from dispatcher import dispatch

SYSTEM = "You are a claims assistant for a Pune motor insurer. Use tools to check facts."


def run_agent(llm, user_message, registry, max_steps=5):
    """Run the model and tools until an answer, a handoff, a stuck loop, or the step limit."""
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_message},
    ]
    specs = [
        {"name": name, "description": tool["description"], "input_schema": tool["schema"]}
        for name, tool in registry.items()
    ]
    failed = set()

    def stop(reason, step):
        return {"answer": None, "stopped": reason, "steps": step, "messages": messages}

    for step in range(1, max_steps + 1):
        reply = llm.complete(messages, tools=specs)
        messages.append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "stopped": "answer", "steps": step, "messages": messages}
        for tool_call in reply["tool_calls"]:
            result = dispatch(tool_call, registry)
            messages.append(result)
            if result["is_error"]:
                key = (tool_call["name"], json.dumps(tool_call.get("arguments"), sort_keys=True))
                if key in failed:
                    return stop("stuck", step)
                failed.add(key)
            elif registry.get(tool_call["name"], {}).get("terminal"):
                return stop("handoff", step)
    return stop("max_steps", max_steps)
