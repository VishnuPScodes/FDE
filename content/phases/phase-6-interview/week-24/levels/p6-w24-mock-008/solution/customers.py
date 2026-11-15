def _normalise(phone):
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits if len(digits) == 10 else ""


def dedupe_customers(rows):
    seen = set()
    result = []
    for row in rows:
        phone = _normalise(row.get("phone", ""))
        if not phone or phone in seen:
            continue
        seen.add(phone)
        result.append(row)
    return result
