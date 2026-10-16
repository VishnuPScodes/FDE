import csv
from io import StringIO

def read_orders(text):
    return list(csv.DictReader(StringIO(text.lstrip("\ufeff"))))
