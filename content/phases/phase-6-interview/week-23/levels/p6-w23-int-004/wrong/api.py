def total_by_state(fetch_page, max_retries=3):
    totals = {}
    page = 1
    while page is not None:
        try:
            data = fetch_page(page)
        except TimeoutError:
            break
        for item in data["items"]:
            totals[item["state"]] = totals.get(item["state"], 0) + item["amount"]
        page = data["next"]
    return totals
