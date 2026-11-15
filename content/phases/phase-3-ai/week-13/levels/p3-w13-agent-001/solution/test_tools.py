import re

from tools import LOOKUP_POLICY


def test_name_and_description():
    assert LOOKUP_POLICY["name"] == "lookup_policy"
    description = LOOKUP_POLICY["description"]
    assert len(description) >= 40, "Say what the tool returns and when to use it"
    assert "policy" in description.lower()


def test_schema_is_a_closed_object():
    schema = LOOKUP_POLICY["input_schema"]
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["policy_number"]


def test_policy_number_pattern():
    prop = LOOKUP_POLICY["input_schema"]["properties"]["policy_number"]
    assert prop["type"] == "string"
    assert prop.get("description"), "Describe the field so the model knows the format"
    pattern = prop["pattern"]
    assert re.search(pattern, "POL-204518")
    for bad in ["pol-204518", "POL-20451", "POL-2045189", "204518", "POL-20451A"]:
        assert not re.search(pattern, bad), f"{bad} should not match"


def test_include_claims_is_optional_boolean():
    prop = LOOKUP_POLICY["input_schema"]["properties"]["include_claims"]
    assert prop["type"] == "boolean"
    assert "include_claims" not in LOOKUP_POLICY["input_schema"]["required"]
