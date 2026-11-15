import json

from mcp_host import MCPHost
from server import handle


def host():
    h = MCPHost(handle)
    h.connect()
    return h


def test_list_resources_without_text():
    resources = host().result("resources/list")["resources"]
    assert [r["uri"] for r in resources] == ["policy://motor/standard-wording", "policy://motor/garages-pune"]
    for resource in resources:
        assert set(resource) == {"uri", "name", "description", "mimeType"}


def test_read_text_resource():
    contents = host().result("resources/read", {"uri": "policy://motor/standard-wording"})["contents"]
    assert len(contents) == 1
    assert contents[0]["uri"] == "policy://motor/standard-wording"
    assert contents[0]["mimeType"] == "text/plain"
    assert "surveyor" in contents[0]["text"]


def test_read_json_resource():
    contents = host().result("resources/read", {"uri": "policy://motor/garages-pune"})["contents"]
    garages = json.loads(contents[0]["text"])
    assert garages[0]["pin"] == "411005"


def test_unknown_resource():
    response = host().request("resources/read", {"uri": "policy://health/secret"})
    assert response["error"] == {"code": -32002, "message": "Resource not found: policy://health/secret"}


def test_bad_uri_param():
    assert host().request("resources/read", {})["error"]["code"] == -32602
    assert host().request("resources/read", {"uri": ["a"]})["error"]["code"] == -32602


def test_tools_still_work():
    assert host().result("tools/list")["tools"][0]["name"] == "get_claim_status"
