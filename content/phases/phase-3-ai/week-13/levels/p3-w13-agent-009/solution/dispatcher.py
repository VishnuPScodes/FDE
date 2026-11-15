import json

from schema_check import validate_args


def dispatch(tool_call, registry):
    """Run one tool call and return a tool message. Never raise."""

    def result(content, is_error):
        return {"role": "tool", "tool_call_id": tool_call["id"], "content": content, "is_error": is_error}

    name = tool_call["name"]
    if name not in registry:
        return result(f"unknown tool: {name}. Available tools: {', '.join(sorted(registry))}", True)
    arguments = tool_call.get("arguments", {})
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except json.JSONDecodeError:
            return result("arguments are not valid JSON", True)
    tool = registry[name]
    errors = validate_args(tool["schema"], arguments)
    if errors:
        return result("invalid arguments: " + "; ".join(errors), True)
    try:
        output = tool["fn"](**arguments)
    except Exception as error:
        return result(f"{type(error).__name__}: {error}", True)
    return result(json.dumps(output, ensure_ascii=False), False)
