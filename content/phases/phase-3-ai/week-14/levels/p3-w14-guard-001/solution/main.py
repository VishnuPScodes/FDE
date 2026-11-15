import re

RULES = [
    ("EMAIL", r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
    ("AADHAAR", r"(?<!\d)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?!\d)"),
    ("PAN", r"(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])"),
    ("PHONE", r"(?<!\d)(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)"),
]


def redact(text):
    counts = {}
    for label, pattern in RULES:
        text, n = re.subn(pattern, f"[{label}]", text)
        if n:
            counts[label] = n
    return text, counts
