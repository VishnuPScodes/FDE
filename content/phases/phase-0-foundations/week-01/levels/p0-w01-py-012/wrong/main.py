import csv

with open("orders.csv", newline="") as handle:
    rows = csv.DictReader(handle)
    total = sum(int(row["amount"]) for row in rows)
print(len(list(rows)))
