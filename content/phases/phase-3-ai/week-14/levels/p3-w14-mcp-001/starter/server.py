LATEST = "2025-06-18"
SUPPORTED = {"2025-06-18", "2025-03-26"}
SERVER_INFO = {"name": "pune-claims-mcp", "version": "1.0.0"}


def ok(request_id, result):
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def err(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def handle(request):
    """Take one JSON-RPC message (a dict) and return the response dict, or None."""
    # TODO
    pass
