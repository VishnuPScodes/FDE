REQUIRED = ["Problem", "Success Metric", "MVP", "Out of Scope", "Timeline", "Data Handling", "Sign-off"]


def missing_sections(doc: str) -> list[str]:
    return [name for name in REQUIRED if name not in doc]


def metric_ok(text: str) -> bool:
    return any(ch.isdigit() for ch in text)
