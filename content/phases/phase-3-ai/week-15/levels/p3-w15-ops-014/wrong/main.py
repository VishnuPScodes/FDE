# Common mistake: counts errors but sorts by raw error count and forgets the rate.
def error_rates(spans):
    totals = {}
    for span in spans:
        entry = totals.setdefault(span["name"], {"name": span["name"], "calls": 0, "errors": 0})
        entry["calls"] += 1
        entry["errors"] += span["status"] == "error"
    return sorted(totals.values(), key=lambda row: -row["errors"])
