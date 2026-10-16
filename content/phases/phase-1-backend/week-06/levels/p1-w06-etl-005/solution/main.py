def deduplicate(records):
    winners = {}
    for record in records:
        key = record["gstin"].strip().upper()
        current = winners.get(key)
        if current is None or record["updated_at"] > current["updated_at"]:
            winners[key] = record
    return [winners[key] for key in sorted(winners)]
