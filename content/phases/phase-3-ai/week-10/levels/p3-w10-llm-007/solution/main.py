import json


def assemble_stream(lines):
    parts = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith(":") or not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if payload == "[DONE]":
            break
        chunk = json.loads(payload)
        if "error" in chunk:
            raise RuntimeError(chunk["error"].get("message", "stream error"))
        choices = chunk.get("choices") or [{}]
        content = choices[0].get("delta", {}).get("content")
        if isinstance(content, str):
            parts.append(content)
    return "".join(parts)
