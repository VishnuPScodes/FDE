def slowest_span(spans):
    if not spans:
        return None
    s = max(spans, key=lambda item: item["duration_ms"])
    return (s["name"], s["duration_ms"])
