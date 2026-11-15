def validate_golden(rows):
    problems = []
    seen = set()
    for r in rows:
        if r["id"] in seen:
            problems.append(f"duplicate_id:{r['id']}")
        seen.add(r["id"])
        if not r["question"]:
            problems.append(f"empty_question:{r['id']}")
        if not r["relevant_ids"]:
            problems.append(f"no_relevant:{r['id']}")
    return problems
