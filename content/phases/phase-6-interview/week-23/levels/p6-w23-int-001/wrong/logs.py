def error_rates(lines):
    totals, errors = {}, {}
    for line in lines:
        parts = line.split()
        if len(parts) != 6:
            continue
        path = parts[3]
        totals[path] = totals.get(path, 0) + 1
        if parts[4].startswith("5"):
            errors[path] = errors.get(path, 0) + 1
    return {p: round(100 * errors.get(p, 0) / n, 1) for p, n in totals.items()}
