SENSITIVE_KEYS = {"phone", "aadhaar", "pan", "password", "token", "api_key"}
MAX_TEXT = 100


def redact(value, sensitive=SENSITIVE_KEYS):
    # TODO
    return value


def audit_entry(tool_call, approval, reviewer=None):
    # TODO
    pass
