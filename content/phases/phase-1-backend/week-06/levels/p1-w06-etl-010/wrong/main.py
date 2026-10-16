def entity_key(record):
    return (record.get("name") or "").strip().lower()
