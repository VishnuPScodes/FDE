import json


def assemble_stream(lines):
    text = ""
    for line in lines:
        if line.startswith("data: "):
            chunk = json.loads(line[6:])
            text += chunk["choices"][0]["delta"].get("content", "")
    return text
