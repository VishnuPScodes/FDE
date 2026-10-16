def normalize_region(row):
    result = dict(row)
    result["region"] = (result.get("region") or "").strip() or "unknown"
    return result
