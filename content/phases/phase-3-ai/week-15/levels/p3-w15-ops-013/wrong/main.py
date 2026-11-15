# Common mistake: blocks at exactly the limit (>= instead of >) and still charges the blocked call.
def budget_status(spent_paise, call_paise, daily_limit_paise, warn_ratio=0.8):
    after = spent_paise + call_paise
    if after >= daily_limit_paise:
        return {"status": "block", "spent_after_paise": after, "remaining_paise": 0}
    status = "warn" if after > daily_limit_paise * warn_ratio else "ok"
    return {"status": status, "spent_after_paise": after, "remaining_paise": daily_limit_paise - after}
