# Common mistake: truncating rows but still sending every column, including PAN.
def shape_result(rows, fields, limit=10):
    kept = rows[:limit]
    truncated = len(rows) > len(kept)
    shaped = {"rows": kept, "returned": len(kept), "total": len(rows), "truncated": truncated}
    if truncated:
        shaped["note"] = f"Showing {len(kept)} of {len(rows)} rows. Ask with a narrower filter for more."
    return shaped
