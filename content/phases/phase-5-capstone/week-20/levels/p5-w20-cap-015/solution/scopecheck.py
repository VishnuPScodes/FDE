REQUIRED = ["Problem", "Success Metric", "MVP", "Out of Scope", "Timeline", "Data Handling", "Sign-off"]


def missing_sections(doc: str) -> list[str]:
    found = {line.lstrip("#").strip().lower() for line in doc.splitlines() if line.startswith("#")}
    return [name for name in REQUIRED if name.lower() not in found]


def metric_ok(text: str) -> bool:
    lower = text.lower()
    return any(ch.isdigit() for ch in lower) and any(w in lower for w in ("week", "month", "day"))
