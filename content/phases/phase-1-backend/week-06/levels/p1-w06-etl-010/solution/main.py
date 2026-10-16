def entity_key(record):
    value = (record.get("gstin") or "").strip().upper()
    return value or None
