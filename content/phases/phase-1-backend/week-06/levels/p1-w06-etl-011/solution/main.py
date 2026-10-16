def next_checkpoint(records, current=None):
    timestamps = [row["updated_at"] for row in records if row.get("updated_at")]
    return max(timestamps) if timestamps else current
