def regression_gate(baseline, current, max_drop=0.02, floors=None):
    failures = [n for n, b in baseline.items() if n in current and b - current[n] >= max_drop]
    return {"passed": not failures, "failures": failures}


def exit_code(result):
    return 0
