from mcp_host import MCPHost
from server import handle


def host():
    h = MCPHost(handle)
    h.connect()
    return h


def get(arguments, name="summarise_claim"):
    return host().request("prompts/get", {"name": name, "arguments": arguments})


def test_list_prompts():
    prompts = host().result("prompts/list")["prompts"]
    assert [p["name"] for p in prompts] == ["summarise_claim"]
    assert set(prompts[0]) == {"name", "description", "arguments"}
    assert prompts[0]["arguments"][0] == {"name": "claim_id", "description": "Claim id like CLM-1042", "required": True}


def test_get_prompt_with_default_language():
    result = get({"claim_id": "CLM-1042"})["result"]
    message = result["messages"][0]
    assert message["role"] == "user"
    assert message["content"] == {"type": "text", "text":
        "Summarise claim CLM-1042 for the customer in English. Use short sentences and no jargon."}


def test_get_prompt_in_marathi():
    text = get({"claim_id": "CLM-1043", "language": "Marathi"})["result"]["messages"][0]["content"]["text"]
    assert "CLM-1043" in text and "in Marathi." in text


def test_errors_in_order():
    assert get({}, name="write_poem")["error"] == {"code": -32602, "message": "Unknown prompt: write_poem"}
    assert get({"claim_id": "CLM-1", "tone": "angry"})["error"]["message"] == "Unknown argument: tone"
    assert get({"claim_id": 1042})["error"]["message"] == "Argument claim_id must be a string"
    assert get({"language": "Hindi"})["error"]["message"] == "Missing required argument: claim_id"


def test_values_are_not_expanded():
    text = get({"claim_id": "{language}", "language": "Tamil"})["result"]["messages"][0]["content"]["text"]
    assert text.startswith("Summarise claim {language} for the customer in Tamil.")


def test_resources_still_work():
    assert len(host().result("resources/list")["resources"]) == 2
