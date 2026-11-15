from collections import Counter


def validate_golden(rows):
    problems = []
    counts = Counter(r["id"] for r in rows)
    problems += [f"duplicate_id:{i}" for i, n in counts.items() if n > 1]
    for r in rows:
        if not r["question"].strip():
            problems.append(f"empty_question:{r['id']}")
        if not r["relevant_ids"] and "unanswerable" not in r.get("tags", []):
            problems.append(f"no_relevant:{r['id']}")
    return sorted(problems)
