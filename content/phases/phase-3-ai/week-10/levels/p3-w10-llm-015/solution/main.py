import json


def assemble_tool_calls(lines):
    calls = {}
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
            entry = calls.setdefault(piece["index"], {"id": None, "name": None, "parts": []})
            function = piece.get("function") or {}
            if piece.get("id"):
                entry["id"] = piece["id"]
            if function.get("name"):
                entry["name"] = function["name"]
            entry["parts"].append(function.get("arguments") or "")
    result = []
    for index in sorted(calls):
        entry = calls[index]
        text = "".join(entry["parts"])
        try:
            arguments = json.loads(text) if text else {}
        except json.JSONDecodeError as error:
            raise ValueError(f"bad arguments for {entry['name']}: {text!r}") from error
        result.append({"id": entry["id"], "name": entry["name"], "arguments": arguments})
    return result
