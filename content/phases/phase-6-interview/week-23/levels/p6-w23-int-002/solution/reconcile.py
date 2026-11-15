def _amount(text: str) -> float:
    return round(float(text.replace("Rs", "").replace(",", "").strip()), 2)


def _index(rows: list[dict]) -> dict[str, float]:
    return {r["order_id"].strip().upper(): _amount(r["amount"]) for r in rows}


def reconcile(tally: list[dict], whatsapp: list[dict]) -> dict:
    t, w = _index(tally), _index(whatsapp)
    return {
        "missing_in_tally": sorted(w.keys() - t.keys()),
        "missing_in_whatsapp": sorted(t.keys() - w.keys()),
        "amount_mismatch": sorted(k for k in t.keys() & w.keys() if t[k] != w[k]),
    }
