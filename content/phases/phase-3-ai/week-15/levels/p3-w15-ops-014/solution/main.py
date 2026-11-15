def error_rates(spans):
    totals = {}
    for span in spans:
        entry = totals.setdefault(span["name"], {"calls": 0, "errors": 0})
        entry["calls"] += 1
        if span["status"] == "error":
            entry["errors"] += 1
    ranked = sorted(totals.items(), key=lambda item: (-item[1]["errors"] / item[1]["calls"], -item[1]["calls"], item[0]))
    return [{"name": name, "calls": e["calls"], "errors": e["errors"],
             "error_rate": round(e["errors"] / e["calls"], 3)} for name, e in ranked]
