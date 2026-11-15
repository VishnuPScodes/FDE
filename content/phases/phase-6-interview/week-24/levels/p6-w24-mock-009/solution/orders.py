UNITS = {"kg", "g", "l", "pcs"}


def parse_order(message):
    items = []
    for part in message.split(","):
        tokens = part.split()
        if len(tokens) < 2 or not tokens[0].isdigit():
            continue
        qty = int(tokens[0])
        if tokens[1].lower() in UNITS and len(tokens) > 2:
            unit, rest = tokens[1].lower(), tokens[2:]
        else:
            unit, rest = "pcs", tokens[1:]
        items.append({"qty": qty, "unit": unit, "item": " ".join(rest).lower()})
    return items
