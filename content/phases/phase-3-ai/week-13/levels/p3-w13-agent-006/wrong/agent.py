import json

from dispatcher import dispatch

SYSTEM = "You are a claims assistant for a Pune motor insurer. Use tools to check facts."


# Common mistake: treating any repeated call as stuck, even successful ones,
# and handing off before checking whether the terminal tool worked.
def run_agent(llm, user_message, registry, max_steps=5):
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_message}]
    specs = [{"name": n, "description": t["description"], "input_schema": t["schema"]} for n, t in registry.items()]
    seen = set()
    for step in range(1, max_steps + 1):
        reply = llm.complete(messages, tools=specs)
        messages.append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "stopped": "answer", "steps": step, "messages": messages}
        for tool_call in reply["tool_calls"]:
            messages.append(dispatch(tool_call, registry))
            key = (tool_call["name"], json.dumps(tool_call["arguments"], sort_keys=True))
            if key in seen:
                return {"answer": None, "stopped": "stuck", "steps": step, "messages": messages}
            seen.add(key)
            if registry.get(tool_call["name"], {}).get("terminal"):
                return {"answer": None, "stopped": "handoff", "steps": step, "messages": messages}
    return {"answer": None, "stopped": "max_steps", "steps": max_steps, "messages": messages}
