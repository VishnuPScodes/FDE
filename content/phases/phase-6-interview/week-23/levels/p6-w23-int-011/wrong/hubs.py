def top_breaches(events, n):
    counts = {}
    for event in events:
        if event["hours"] >= event["sla_hours"]:
            counts[event["hub"]] = counts.get(event["hub"], 0) + 1
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)[:n]
