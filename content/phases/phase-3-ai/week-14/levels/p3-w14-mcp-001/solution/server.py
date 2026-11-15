LATEST = "2025-06-18"
SUPPORTED = {"2025-06-18", "2025-03-26"}
SERVER_INFO = {"name": "pune-claims-mcp", "version": "1.0.0"}


def ok(request_id, result):
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def err(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def handle(request):
    """Take one JSON-RPC message (a dict) and return the response dict, or None."""
    if not isinstance(request, dict):
        return err(None, -32600, "Invalid Request")
    if request.get("jsonrpc") != "2.0" or not isinstance(request.get("method"), str):
        return err(request.get("id"), -32600, "Invalid Request")
    if "id" not in request:
        return None
    request_id = request["id"]
    method = request["method"]
    params = request.get("params") or {}
    if method == "initialize":
        asked = params.get("protocolVersion")
        return ok(request_id, {
            "protocolVersion": asked if asked in SUPPORTED else LATEST,
            "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
            "serverInfo": SERVER_INFO,
        })
    if method == "ping":
        return ok(request_id, {})
    return err(request_id, -32601, f"Method not found: {method}")
