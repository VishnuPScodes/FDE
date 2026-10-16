def partition_rows(rows):
    accepted, rejected = [], []
    for row in rows:
        normalized = {key: value.strip() if isinstance(value, str) else value for key, value in row.items()}
        reason = "id is required" if not normalized.get("id") else "name is required" if not normalized.get("name") else None
        if reason:
            rejected.append({"row": row, "reason": reason})
        else:
            accepted.append(normalized)
    return accepted, rejected
