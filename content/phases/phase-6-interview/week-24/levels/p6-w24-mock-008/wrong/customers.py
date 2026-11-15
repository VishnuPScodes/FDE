def _normalise(phone):
    # Bug: lstrip("91") removes every leading 9 and 1, not the "91" prefix once.
    return "".join(ch for ch in phone if ch.isdigit()).lstrip("91")


def dedupe_customers(rows):
    seen = set()
    result = []
    for row in rows:
        phone = _normalise(row["phone"])
        if not phone or phone in seen:
            continue
        seen.add(phone)
        result.append(row)
    return result
