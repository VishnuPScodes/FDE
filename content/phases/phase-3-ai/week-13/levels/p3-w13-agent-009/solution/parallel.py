import json

from dispatcher import dispatch


def execute_tool_calls(tool_calls, registry):
    """Return one tool message per call, in order. Run identical calls once."""
    cache = {}
    results = []
    for tool_call in tool_calls:
        key = (tool_call["name"], json.dumps(tool_call.get("arguments"), sort_keys=True))
        if key in cache:
            results.append({**cache[key], "tool_call_id": tool_call["id"]})
            continue
        message = dispatch(tool_call, registry)
        cache[key] = message
        results.append(message)
    return results
