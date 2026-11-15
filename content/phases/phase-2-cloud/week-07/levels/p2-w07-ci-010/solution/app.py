def order_total(price, qty):
    return price * qty


def apply_discount(price, percent):
    return price - price * percent / 100
