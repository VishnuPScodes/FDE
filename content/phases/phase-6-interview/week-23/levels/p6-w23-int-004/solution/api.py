def _fetch_with_retry(fetch_page, page, max_retries):
    for attempt in range(max_retries):
        try:
            return fetch_page(page)
        except TimeoutError:
            if attempt == max_retries - 1:
                raise


def total_by_state(fetch_page, max_retries: int = 3) -> dict[str, int]:
    totals: dict[str, int] = {}
    page = 1
    while page is not None:
        data = _fetch_with_retry(fetch_page, page, max_retries)
        for item in data["items"]:
            totals[item["state"]] = totals.get(item["state"], 0) + item["amount"]
        page = data["next"]
    return totals
