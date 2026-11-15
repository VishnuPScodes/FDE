def parse_table(text):
    lines = [line for line in text.splitlines() if line.strip()]
    header = [cell.strip() for cell in lines[0].split("|")]
    return [dict(zip(header, [cell.strip() for cell in line.split("|")])) for line in lines[1:]]


def row_to_text(row):
    return str(row)
