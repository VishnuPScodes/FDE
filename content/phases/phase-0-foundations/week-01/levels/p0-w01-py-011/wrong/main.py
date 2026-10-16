quantity_text = "two"
try:
    quantity = int(quantity_text)
    print(quantity)
except TypeError:
    print("Quantity must be a whole number.")
