from decimal import Decimal, InvalidOperation

def rupees_to_paise(value):
    normalized = value.replace("₹", "").replace(",", "").strip()
    if not normalized:
        raise ValueError("amount is required")
    try:
        amount = Decimal(normalized)
    except InvalidOperation as error:
        raise ValueError("invalid amount") from error
    if amount.as_tuple().exponent < -2:
        raise ValueError("amount has more than two decimal places")
    return int(amount * 100)
