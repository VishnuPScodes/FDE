def trace_tree(spans):
    ids = {s["id"] for s in spans}
    children = {}
    roots = []
    for s in sorted(spans, key=lambda item: item["id"]):
        if s["parent_id"] in ids:
            children.setdefault(s["parent_id"], []).append(s)
        else:
            roots.append(s)
    lines = []

    def walk(s, depth):
        line = "  " * depth + f"{s['name']} {s['duration_ms']:g}ms"
        if s["status"] == "error":
            line += " [error]"
        lines.append(line)
        for child in children.get(s["id"], []):
            walk(child, depth + 1)

    for root in roots:
        walk(root, 0)
    return lines
