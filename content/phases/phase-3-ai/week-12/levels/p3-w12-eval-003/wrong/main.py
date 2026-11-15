EDGE_TAGS = {"typo", "hinglish", "unanswerable", "multi-hop"}


def coverage(rows, required_tags):
    counts = {t: sum(r.get("tags", []).count(t) for r in rows) for t in required_tags}
    edge = sum(r.get("tags", []).count(t) for r in rows for t in EDGE_TAGS)
    return {"counts": counts, "missing": [t for t in counts if not counts[t]],
            "edge_share": round(edge / len(rows), 2)}
