def total_paid(lines):
    total = 0.0
    for line in lines:
        parts = line.split("|")
        if len(parts) != 3:
            continue
        _, amount, status = parts
        if status.strip().lower() != "paid":
            continue
        clean = amount.replace("Rs.", "").replace("Rs", "").replace("₹", "").replace(",", "").strip()
        try:
            total += float(clean)
        except ValueError:
            continue
    return round(total, 2)
