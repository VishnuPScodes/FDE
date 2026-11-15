def shape_result(rows, fields, limit=10):
    """Return a small, model-friendly version of a tool's rows."""
    kept = [{key: row[key] for key in fields if key in row} for row in rows[:limit]]
    truncated = len(rows) > len(kept)
    shaped = {"rows": kept, "returned": len(kept), "total": len(rows), "truncated": truncated}
    if truncated:
        shaped["note"] = f"Showing {len(kept)} of {len(rows)} rows. Ask with a narrower filter for more."
    return shaped
