REQUIRED = ["WHATSAPP_TOKEN", "SHEET_ID"]


def load_config(env: dict) -> dict:
    missing = sorted(name for name in REQUIRED if not env.get(name, "").strip())
    if missing:
        raise ValueError("Missing: " + ", ".join(missing))
    return {
        "whatsapp_token": env["WHATSAPP_TOKEN"],
        "sheet_id": env["SHEET_ID"],
        "port": int(env.get("PORT", "8000")),
        "debug": env.get("DEBUG", "").lower() in {"1", "true", "yes"},
    }


def mask(value: str) -> str:
    if len(value) <= 4:
        return "*" * len(value)
    return "*" * (len(value) - 4) + value[-4:]
