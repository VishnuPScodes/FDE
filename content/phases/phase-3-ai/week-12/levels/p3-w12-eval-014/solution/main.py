def regression_gate(baseline, current, max_drop=0.02, floors=None):
    floors = floors or {}
    failures = []
    for name, base in baseline.items():
        if name not in current:
            failures.append(name)
            continue
        now = current[name]
        if round(base - now, 4) > max_drop or (name in floors and now < floors[name]):
            failures.append(name)
    return {"passed": not failures, "failures": sorted(failures)}


def exit_code(result):
    return 0 if result["passed"] else 1
