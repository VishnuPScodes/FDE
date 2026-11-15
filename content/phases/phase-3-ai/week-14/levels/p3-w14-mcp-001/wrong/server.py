LATEST = "2025-06-18"
SUPPORTED = {"2025-06-18", "2025-03-26"}
SERVER_INFO = {"name": "pune-claims-mcp", "version": "1.0.0"}


# Common mistake: answering notifications and treating id 0 as "no id".
def handle(request):
    request_id = request.get("id")
    if request["method"] == "initialize":
        return {"jsonrpc": "2.0", "id": request_id, "result": {
            "protocolVersion": LATEST, "capabilities": {"tools": {}, "resources": {}, "prompts": {}}, "serverInfo": SERVER_INFO}}
    if not request_id:
        return None
    if request["method"] == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found"}}
