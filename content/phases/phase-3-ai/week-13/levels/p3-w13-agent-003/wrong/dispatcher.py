import json

# Common mistake: trusting the model's arguments and letting exceptions escape.


def dispatch(tool_call, registry):
    tool = registry[tool_call["name"]]
    arguments = tool_call["arguments"]
    if isinstance(arguments, str):
        arguments = json.loads(arguments)
    output = tool["fn"](**arguments)
    return {"role": "tool", "tool_call_id": tool_call["id"], "content": json.dumps(output), "is_error": False}
