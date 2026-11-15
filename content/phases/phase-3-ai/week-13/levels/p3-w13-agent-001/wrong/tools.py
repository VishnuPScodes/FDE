# Common mistake: an unanchored pattern and an open schema.
LOOKUP_POLICY = {
    "name": "lookup_policy",
    "description": "Look up a motor insurance policy by its policy number and return its status.",
    "input_schema": {
        "type": "object",
        "properties": {
            "policy_number": {"type": "string", "description": "Like POL-204518", "pattern": "POL-[0-9]{6}"},
            "include_claims": {"type": "boolean"},
        },
        "required": ["policy_number", "include_claims"],
    },
}
