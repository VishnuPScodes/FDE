import json


def serve_lines(lines, handler):
    out = []
    for line in lines:
        message = json.loads(line)
        out.append(json.dumps(handler(message)))
    return out
