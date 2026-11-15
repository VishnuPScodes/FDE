def run_cases(guard, cases):
    if not cases:
        raise ValueError("no cases")
    failures = []
    for text, expected in cases:
        try:
            got = guard(text)["action"]
        except Exception:
            failures.append({"text": text, "expected": expected, "got": "error", "kind": "error"})
            continue
        if got == expected:
            continue
        if got == "allow":
            kind = "missed"
        elif expected == "allow":
            kind = "over_blocked"
        else:
            kind = "wrong_action"
        failures.append({"text": text, "expected": expected, "got": got, "kind": kind})
    total = len(cases)
    passed = total - len(failures)
    return {"total": total, "passed": passed, "rate": round(passed / total, 2), "failures": failures}
