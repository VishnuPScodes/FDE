REQUIRED = ["WHATSAPP_TOKEN", "SHEET_ID"]


def load_config(env: dict) -> dict:
    missing = [name for name in REQUIRED if name not in env]
    if missing:
        raise ValueError("Missing: " + ", ".join(missing))
    return {
        "whatsapp_token": env["WHATSAPP_TOKEN"],
        "sheet_id": env["SHEET_ID"],
        "port": int(env.get("PORT", 8000)),
        "debug": bool(env.get("DEBUG")),
    }


def mask(value: str) -> str:
    return value[-4:]
