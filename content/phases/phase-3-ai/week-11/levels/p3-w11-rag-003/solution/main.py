import re

SEPARATOR = re.compile(r"^[\s|:\-]+$")


def split_cells(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def parse_table(text):
    header = None
    rows = []
    for number, line in enumerate(text.strip("\n").splitlines(), start=1):
        if not line.strip() or SEPARATOR.match(line):
            continue
        cells = split_cells(line)
        if header is None:
            header = [cell.lower().replace(" ", "_") for cell in cells]
            continue
        if len(cells) != len(header):
            raise ValueError(f"line {number}: expected {len(header)} cells, got {len(cells)}")
        rows.append(dict(zip(header, cells)))
    return rows


def row_to_text(row):
    return "; ".join(f"{key}: {value}" for key, value in row.items())
