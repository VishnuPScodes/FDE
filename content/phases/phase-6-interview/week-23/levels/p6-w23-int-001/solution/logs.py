def error_rates(lines: list[str]) -> dict[str, float]:
    totals: dict[str, int] = {}
    errors: dict[str, int] = {}
    for line in lines:
        parts = line.split()
        if len(parts) != 6 or not parts[4].isdigit():
            continue
        path = parts[3].split("?")[0]
        status = int(parts[4])
        totals[path] = totals.get(path, 0) + 1
        if 500 <= status <= 599:
            errors[path] = errors.get(path, 0) + 1
    return {p: round(100 * errors.get(p, 0) / n, 1) for p, n in totals.items()}
