LOOKUP_POLICY = {
    "name": "lookup_policy",
    "description": (
        "Look up a motor insurance policy by its policy number. Returns the holder name, "
        "cover type, expiry date and status. Use it whenever the customer mentions a policy."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "policy_number": {
                "type": "string",
                "description": "Policy number in the form POL-204518 (POL- and six digits).",
                "pattern": "^POL-[0-9]{6}$",
            },
            "include_claims": {
                "type": "boolean",
                "description": "Set true to also return past claims on this policy.",
            },
        },
        "required": ["policy_number"],
        "additionalProperties": False,
    },
}
