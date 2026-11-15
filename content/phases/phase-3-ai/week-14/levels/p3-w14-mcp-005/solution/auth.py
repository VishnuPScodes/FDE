import copy

from server import TOOLS, err, handle

TOKENS = {
    "tok-whatsapp-bot": {"claims:read"},
    "tok-claims-officer": {"claims:read", "claims:write"},
}


def handle_with_auth(request, token):
    """Check the caller's token and scopes, then pass the request to handle()."""
    is_request = isinstance(request, dict) and "id" in request
    scopes = TOKENS.get(token)
    if scopes is None:
        return err(request.get("id"), -32001, "Unauthorized") if is_request else None
    method = request.get("method") if isinstance(request, dict) else None
    if method == "tools/call":
        name = (request.get("params") or {}).get("name")
        tool = TOOLS.get(name)
        if tool is not None and tool["scope"] not in scopes:
            return err(request.get("id"), -32003, f"Forbidden: {name} needs {tool['scope']}")
    response = handle(request)
    if method == "tools/list" and response and "result" in response:
        response = copy.deepcopy(response)
        response["result"]["tools"] = [
            tool for tool in response["result"]["tools"] if TOOLS[tool["name"]]["scope"] in scopes
        ]
    return response
