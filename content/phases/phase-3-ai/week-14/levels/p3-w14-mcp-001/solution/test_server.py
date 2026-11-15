from mcp_host import MCPHost
from server import LATEST, SERVER_INFO, handle


def test_handshake():
    host = MCPHost(handle)
    result = host.connect()
    assert result["protocolVersion"] == "2025-06-18"
    assert result["serverInfo"] == SERVER_INFO
    assert result["capabilities"] == {"tools": {}, "resources": {}, "prompts": {}}


def test_supported_older_version_is_echoed():
    assert MCPHost(handle).connect("2025-03-26")["protocolVersion"] == "2025-03-26"


def test_unknown_version_gets_latest():
    assert MCPHost(handle).connect("1999-01-01")["protocolVersion"] == LATEST


def test_ping():
    assert MCPHost(handle).result("ping") == {}


def test_unknown_method():
    response = MCPHost(handle).request("claims/delete_all")
    assert response["error"]["code"] == -32601
    assert response["error"]["message"] == "Method not found: claims/delete_all"


def test_notifications_get_no_reply():
    assert handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None
    assert handle({"jsonrpc": "2.0", "method": "notifications/unknown"}) is None


def test_zero_is_a_valid_id():
    assert handle({"jsonrpc": "2.0", "id": 0, "method": "ping"}) == {"jsonrpc": "2.0", "id": 0, "result": {}}


def test_invalid_requests():
    assert handle({"jsonrpc": "1.0", "id": 4, "method": "ping"}) == {
        "jsonrpc": "2.0", "id": 4, "error": {"code": -32600, "message": "Invalid Request"}}
    assert handle({"jsonrpc": "2.0", "id": 5})["error"]["code"] == -32600
    assert handle(["not", "a", "dict"]) == {
        "jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}}
