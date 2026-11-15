import re


def mask_phone(text: str) -> str:
    # Only catches the plain 10-digit form: misses "98765 43210" and "+91" prefixes.
    return re.sub(r"[6-9]\d{9}", lambda m: "XXXXXX" + m.group()[-4:], text)


def safe_log(event: dict) -> str:
    return " ".join(f"{k}={mask_phone(str(v))}" for k, v in sorted(event.items()))
