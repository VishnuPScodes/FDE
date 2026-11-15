def total_paid(lines):
    total = 0.0
    for line in lines:
        parts = line.split("|")
        if parts[-1] == "Paid":
            total += float(parts[1].replace("Rs", "").replace(",", ""))
    return total
