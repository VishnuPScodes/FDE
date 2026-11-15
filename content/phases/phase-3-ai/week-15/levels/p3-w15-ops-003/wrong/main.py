def trace_tree(spans):
    lines = []
    for s in spans:
        depth = 0 if s["parent_id"] is None else 1
        lines.append("  " * depth + f"{s['name']} {s['duration_ms']}ms")
    return lines
