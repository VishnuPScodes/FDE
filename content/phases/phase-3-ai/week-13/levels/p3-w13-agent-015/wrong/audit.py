SENSITIVE_KEYS = {"phone", "aadhaar", "pan", "password", "token", "api_key"}
MAX_TEXT = 100


# Common mistake: redacts only top-level keys and edits the caller's dict in place.
def redact(value, sensitive=SENSITIVE_KEYS):
    for key in list(value):
        if key in sensitive:
            value[key] = "[REDACTED]"
    return value


def audit_entry(tool_call, approval, reviewer=None):
    return {"tool": tool_call["name"], "arguments": redact(tool_call["arguments"]),
            "approval": approval, "reviewer": reviewer}
