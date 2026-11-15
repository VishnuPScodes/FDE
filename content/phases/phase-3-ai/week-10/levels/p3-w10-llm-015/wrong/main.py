import json


# Common mistake: adds each argument piece to the most recent call instead of grouping by `index`.
# Works for one call, but mixes up the arguments when two tool calls stream at the same time.
def assemble_tool_calls(lines):
    calls = []
    for line in lines:
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if payload == "[DONE]":
            break
        chunk = json.loads(payload)
        choices = chunk.get("choices") or [{}]
        for piece in choices[0].get("delta", {}).get("tool_calls") or []:
            function = piece.get("function") or {}
            if piece.get("id"):
                calls.append({"id": piece["id"], "name": function.get("name"), "text": ""})
            calls[-1]["text"] += function.get("arguments") or ""
    result = []
    for call in calls:
        try:
            arguments = json.loads(call["text"]) if call["text"] else {}
        except json.JSONDecodeError as error:
            raise ValueError(f"bad arguments for {call['name']}") from error
        result.append({"id": call["id"], "name": call["name"], "arguments": arguments})
    return result
