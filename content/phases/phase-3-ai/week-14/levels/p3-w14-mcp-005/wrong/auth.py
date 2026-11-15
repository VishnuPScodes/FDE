from server import TOOLS, err, handle

TOKENS = {
    "tok-whatsapp-bot": {"claims:read"},
    "tok-claims-officer": {"claims:read", "claims:write"},
}


# Common mistake: hiding the tool from the listing but not blocking the call.
# A client can still call a tool it was never shown.
def handle_with_auth(request, token):
    scopes = TOKENS.get(token)
    if scopes is None:
        return err(request.get("id"), -32001, "Unauthorized")
    response = handle(request)
    if request.get("method") == "tools/list":
        response["result"]["tools"] = [t for t in response["result"]["tools"] if TOOLS[t["name"]]["scope"] in scopes]
    return response
