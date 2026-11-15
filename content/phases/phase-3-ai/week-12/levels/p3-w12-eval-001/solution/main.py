import json

REQUIRED = ("id", "question", "relevant_ids")


def load_golden(text):
    rows = []
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            raise ValueError(f"line {n}: invalid JSON")
        missing = sorted(k for k in REQUIRED if k not in row)
        if missing:
            raise ValueError(f"line {n}: missing {missing}")
        rows.append(row)
    return rows
