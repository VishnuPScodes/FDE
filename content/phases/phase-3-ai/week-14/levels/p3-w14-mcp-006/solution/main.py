import json


def _error(code, message, request_id=None):
    return json.dumps({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}, ensure_ascii=False)


def serve_lines(lines, handler):
    out = []
    for line in lines:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except ValueError:
            out.append(_error(-32700, "Parse error"))
            continue
        if not isinstance(message, dict):
            out.append(_error(-32600, "Invalid Request"))
            continue
        try:
            response = handler(message)
        except Exception:
            if "id" in message:
                out.append(_error(-32603, "Internal error", message["id"]))
            continue
        if response is not None:
            out.append(json.dumps(response, ensure_ascii=False))
    return out
