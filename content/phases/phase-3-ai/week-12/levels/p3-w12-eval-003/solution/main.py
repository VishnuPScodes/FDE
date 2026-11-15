EDGE_TAGS = {"typo", "hinglish", "unanswerable", "multi-hop"}


def coverage(rows, required_tags):
    counts = {tag: 0 for tag in required_tags}
    edge_rows = 0
    for r in rows:
        tags = set(r.get("tags", []))
        for tag in required_tags:
            if tag in tags:
                counts[tag] += 1
        if tags & EDGE_TAGS:
            edge_rows += 1
    return {
        "counts": counts,
        "missing": [t for t in required_tags if counts[t] == 0],
        "edge_share": round(edge_rows / len(rows), 2) if rows else 0.0,
    }
