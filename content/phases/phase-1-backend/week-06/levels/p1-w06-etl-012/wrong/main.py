def normalize_region(row):
    result = dict(row)
    result["region"] = result.get("region", "unknown")
    return result
