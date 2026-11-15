from parallel import execute_tool_calls

SYSTEM = "You help a Bengaluru e-commerce seller check stock across warehouses."


def run_agent(llm, user_message, registry, max_steps=5):
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_message}]
    specs = [{"name": n, "description": t["description"], "input_schema": t["schema"]} for n, t in registry.items()]
    for step in range(1, max_steps + 1):
        reply = llm.complete(messages, tools=specs)
        messages.append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "stopped": "answer", "steps": step, "messages": messages}
        messages.extend(execute_tool_calls(reply["tool_calls"], registry))
    return {"answer": None, "stopped": "max_steps", "steps": max_steps, "messages": messages}
