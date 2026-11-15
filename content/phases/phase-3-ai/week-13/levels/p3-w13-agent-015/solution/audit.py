SENSITIVE_KEYS = {"phone", "aadhaar", "pan", "password", "token", "api_key"}
MAX_TEXT = 100


def redact(value, sensitive=SENSITIVE_KEYS):
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if str(key).lower() in sensitive else redact(item, sensitive)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item, sensitive) for item in value]
    if isinstance(value, str) and len(value) > MAX_TEXT:
        return value[:MAX_TEXT] + f"...[+{len(value) - MAX_TEXT} chars]"
    return value


def audit_entry(tool_call, approval, reviewer=None):
    return {
        "tool": tool_call["name"],
        "arguments": redact(tool_call.get("arguments") or {}),
        "approval": approval,
        "reviewer": reviewer,
    }
