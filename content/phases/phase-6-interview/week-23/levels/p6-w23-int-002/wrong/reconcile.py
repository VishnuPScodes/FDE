def reconcile(tally, whatsapp):
    t = {r["order_id"]: r["amount"] for r in tally}
    w = {r["order_id"]: r["amount"] for r in whatsapp}
    return {
        "missing_in_tally": sorted(w.keys() - t.keys()),
        "missing_in_whatsapp": sorted(t.keys() - w.keys()),
        "amount_mismatch": sorted(k for k in t.keys() & w.keys() if t[k] != w[k]),
    }
