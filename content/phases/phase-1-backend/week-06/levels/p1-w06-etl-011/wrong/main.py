def next_checkpoint(records, current=None):
    return records[-1]["updated_at"] if records else None
