def slowest_span(spans):
    if not spans:
        return None
    child_total = {}
    for s in spans:
        if s["parent_id"] is not None:
            child_total[s["parent_id"]] = child_total.get(s["parent_id"], 0) + s["duration_ms"]
    best = None
    for s in sorted(spans, key=lambda item: item["id"]):
        self_ms = max(0, s["duration_ms"] - child_total.get(s["id"], 0))
        if best is None or self_ms > best[1]:
            best = (s["name"], self_ms)
    return best
