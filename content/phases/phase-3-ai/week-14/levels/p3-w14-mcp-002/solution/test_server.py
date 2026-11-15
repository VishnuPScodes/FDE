import json

from mcp_host import MCPHost
from server import handle


def host():
    h = MCPHost(handle)
    h.connect()
    return h


def test_tools_list():
    tools = host().result("tools/list")["tools"]
    assert [t["name"] for t in tools] == ["get_claim_status", "list_open_claims"]
    assert set(tools[0]) == {"name", "description", "inputSchema"}
    assert tools[0]["inputSchema"]["required"] == ["claim_id"]


def test_call_tool_success():
    result = host().result("tools/call", {"name": "get_claim_status", "arguments": {"claim_id": "CLM-1042"}})
    assert result["isError"] is False
    assert result["content"][0]["type"] == "text"
    assert json.loads(result["content"][0]["text"])["holder"] == "Ananya Kulkarni"


def test_list_result_is_json_text():
    result = host().result("tools/call", {"name": "list_open_claims", "arguments": {"city": "Nashik"}})
    assert json.loads(result["content"][0]["text"]) == ["CLM-1043"]


def test_unknown_tool_is_protocol_error():
    response = host().request("tools/call", {"name": "delete_claim", "arguments": {}})
    assert response["error"] == {"code": -32602, "message": "Unknown tool: delete_claim"}


def test_invalid_arguments_are_protocol_errors():
    response = host().request("tools/call", {"name": "get_claim_status", "arguments": {"claim_id": "1042", "x": 1}})
    assert response["error"]["code"] == -32602
    assert response["error"]["message"] == "Invalid params: claim_id does not match pattern; unexpected field: x"
    missing = host().request("tools/call", {"name": "get_claim_status"})
    assert missing["error"]["message"] == "Invalid params: missing required field: claim_id"


def test_tool_failure_is_a_result_with_is_error():
    result = host().result("tools/call", {"name": "get_claim_status", "arguments": {"claim_id": "CLM-9999"}})
    assert result == {"content": [{"type": "text", "text": "LookupError: no such claim"}], "isError": True}


def test_handshake_still_works():
    assert host().result("ping") == {}
