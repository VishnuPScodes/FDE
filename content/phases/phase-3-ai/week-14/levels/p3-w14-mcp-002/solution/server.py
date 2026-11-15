import json

from schema_check import validate_args

LATEST = "2025-06-18"
SUPPORTED = {"2025-06-18", "2025-03-26"}
SERVER_INFO = {"name": "pune-claims-mcp", "version": "1.0.0"}

CLAIMS = {
    "CLM-1042": {"holder": "Ananya Kulkarni", "status": "approved", "amount_inr": 38500, "city": "Pune"},
    "CLM-1043": {"holder": "Rohan Deshmukh", "status": "under survey", "amount_inr": 12000, "city": "Nashik"},
}


def get_claim_status(claim_id):
    if claim_id not in CLAIMS:
        raise LookupError("no such claim")
    return {"claim_id": claim_id, **CLAIMS[claim_id]}


def list_open_claims(city):
    return [cid for cid, claim in CLAIMS.items() if claim["city"] == city and claim["status"] != "approved"]


TOOLS = {
    "get_claim_status": {
        "description": "Get the status, holder and amount of one motor claim.",
        "inputSchema": {
            "type": "object",
            "properties": {"claim_id": {"type": "string", "pattern": "^CLM-[0-9]+$"}},
            "required": ["claim_id"],
            "additionalProperties": False,
        },
        "fn": get_claim_status,
    },
    "list_open_claims": {
        "description": "List claim ids that are still open in a city.",
        "inputSchema": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
            "additionalProperties": False,
        },
        "fn": list_open_claims,
    },
}


def ok(request_id, result):
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def err(request_id, code, message):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def call_tool(request_id, params):
    name = params.get("name")
    if name not in TOOLS:
        return err(request_id, -32602, f"Unknown tool: {name}")
    tool = TOOLS[name]
    arguments = params.get("arguments") or {}
    errors = validate_args(tool["inputSchema"], arguments)
    if errors:
        return err(request_id, -32602, "Invalid params: " + "; ".join(errors))
    try:
        value = tool["fn"](**arguments)
    except Exception as error:
        return ok(request_id, {"content": [{"type": "text", "text": f"{type(error).__name__}: {error}"}], "isError": True})
    return ok(request_id, {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False)}], "isError": False})


def handle(request):
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
    if method == "tools/list":
        return ok(request_id, {"tools": [
            {"name": name, "description": tool["description"], "inputSchema": tool["inputSchema"]}
            for name, tool in TOOLS.items()
        ]})
    if method == "tools/call":
        return call_tool(request_id, params)
    return err(request_id, -32601, f"Method not found: {method}")
