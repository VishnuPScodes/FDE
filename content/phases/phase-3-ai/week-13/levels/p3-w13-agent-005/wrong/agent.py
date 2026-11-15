from dispatcher import dispatch

SYSTEM = "You are a claims assistant for a Pune motor insurer. Use tools to check facts."


# Common mistake: `while True` with no step limit, and tool results added
# without the assistant message that asked for them.
def run_agent(llm, user_message, registry, max_steps=5):
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_message},
    ]
    specs = [{"name": n, "description": t["description"], "input_schema": t["schema"]} for n, t in registry.items()]
    step = 0
    while True:
        step += 1
        reply = llm.complete(messages, tools=specs)
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "stopped": "answer", "steps": step, "messages": messages}
        for tool_call in reply["tool_calls"]:
            messages.append(dispatch(tool_call, registry))
