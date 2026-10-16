def rupees_to_paise(value):
    return int(float(value.replace("₹", "").replace(",", "")) * 100)
