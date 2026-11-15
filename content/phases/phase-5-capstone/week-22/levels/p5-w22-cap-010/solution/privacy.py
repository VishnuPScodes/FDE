import re

PHONE = re.compile(r"(?<!\d)(?:\+?91[ -]?)?[6-9]\d{4}[ -]?(\d{5})(?!\d)")


def mask_phone(text: str) -> str:
    return PHONE.sub(lambda m: "XXXXXX" + m.group(1)[-4:], text)


def safe_log(event: dict) -> str:
    return " ".join(f"{k}={mask_phone(str(v))}" for k, v in sorted(event.items()) if k != "token")
