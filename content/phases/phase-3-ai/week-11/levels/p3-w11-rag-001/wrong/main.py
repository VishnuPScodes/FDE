import re


def clean_text(raw):
    text = raw.replace("-\n", " ")
    return re.sub(r"\s+", " ", text).strip()
