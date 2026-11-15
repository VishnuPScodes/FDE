from auth import handle_with_auth
from mcp_host import MCPHost
from server import CLAIMS, TOOLS


def host(token):
    h = MCPHost(lambda request: handle_with_auth(request, token))
    h.connect()
    return h


def test_bad_token_is_rejected():
    h = MCPHost(lambda request: handle_with_auth(request, "tok-stolen"))
    response = h.request("initialize", {"protocolVersion": "2025-06-18"})
    assert response["error"] == {"code": -32001, "message": "Unauthorized"}
    assert handle_with_auth({"jsonrpc": "2.0", "method": "notifications/initialized"}, None) is None


def test_bot_sees_only_read_tools():
    names = [t["name"] for t in host("tok-whatsapp-bot").result("tools/list")["tools"]]
    assert names == ["get_claim_status", "list_open_claims"]


def test_officer_sees_all_tools():
    names = [t["name"] for t in host("tok-claims-officer").result("tools/list")["tools"]]
    assert names == ["get_claim_status", "list_open_claims", "approve_claim"]


def test_listing_does_not_change_tools():
    host("tok-whatsapp-bot").result("tools/list")
    assert "approve_claim" in TOOLS


def test_bot_cannot_call_write_tool_it_never_saw():
    CLAIMS["CLM-1043"]["status"] = "under survey"
    response = host("tok-whatsapp-bot").request("tools/call", {"name": "approve_claim", "arguments": {"claim_id": "CLM-1043"}})
    assert response["error"] == {"code": -32003, "message": "Forbidden: approve_claim needs claims:write"}
    assert CLAIMS["CLM-1043"]["status"] == "under survey"


def test_officer_can_approve():
    CLAIMS["CLM-1043"]["status"] = "under survey"
    result = host("tok-claims-officer").result("tools/call", {"name": "approve_claim", "arguments": {"claim_id": "CLM-1043"}})
    assert result["isError"] is False
    assert CLAIMS["CLM-1043"]["status"] == "approved"
    CLAIMS["CLM-1043"]["status"] = "under survey"


def test_bot_can_read():
    result = host("tok-whatsapp-bot").result("tools/call", {"name": "get_claim_status", "arguments": {"claim_id": "CLM-1042"}})
    assert result["isError"] is False


def test_unknown_tool_error_unchanged():
    response = host("tok-whatsapp-bot").request("tools/call", {"name": "drop_tables", "arguments": {}})
    assert response["error"]["code"] == -32602
