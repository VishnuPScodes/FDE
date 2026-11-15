UNITS = {"kg", "g", "l", "pcs"}


def parse_order(message):
    items = []
    for part in message.split(","):
        tokens = part.split()
        if not tokens or not tokens[0].isdigit():
            continue
        # Bugs: unit compared case-sensitively, and only the last word is kept as the item.
        unit = tokens[1] if len(tokens) > 2 and tokens[1] in UNITS else "pcs"
        items.append({"qty": int(tokens[0]), "unit": unit, "item": tokens[-1].lower()})
    return items
