def with_gst(amount, rate):
    return amount * (1 + rate)

print(round(with_gst(1000, 0.18)))
