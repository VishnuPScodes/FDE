def budget_status(spent_paise, call_paise, daily_limit_paise, warn_ratio=0.8):
    if spent_paise < 0 or call_paise < 0 or daily_limit_paise <= 0:
        raise ValueError("amounts must not be negative and the limit must be positive")
    after = spent_paise + call_paise
    if after > daily_limit_paise:
        return {"status": "block", "spent_after_paise": spent_paise,
                "remaining_paise": max(0, daily_limit_paise - spent_paise)}
    status = "warn" if after >= daily_limit_paise * warn_ratio else "ok"
    return {"status": status, "spent_after_paise": after, "remaining_paise": daily_limit_paise - after}
