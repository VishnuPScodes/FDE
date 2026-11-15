from dispatcher import dispatch

SYSTEM = "You are a claims assistant for a Pune motor insurer. Use tools to check facts."


def run_agent(llm, user_message, registry, max_steps=5):
    """Run the model and tools until there is an answer or the step limit is hit."""
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_message},
    ]
    specs = [
        {"name": name, "description": tool["description"], "input_schema": tool["schema"]}
        for name, tool in registry.items()
    ]
    for step in range(1, max_steps + 1):
        reply = llm.complete(messages, tools=specs)
        messages.append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "stopped": "answer", "steps": step, "messages": messages}
        for tool_call in reply["tool_calls"]:
            messages.append(dispatch(tool_call, registry))
    return {"answer": None, "stopped": "max_steps", "steps": max_steps, "messages": messages}
