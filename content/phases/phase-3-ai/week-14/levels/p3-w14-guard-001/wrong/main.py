import re


def redact(text):
    text = re.sub(r"\d{10}", "[PHONE]", text)
    return text, {}
