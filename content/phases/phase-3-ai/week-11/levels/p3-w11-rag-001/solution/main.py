import re

PAGE_LINE = re.compile(r"^\s*page\s+\d+\s+of\s+\d+\s*$", re.IGNORECASE | re.MULTILINE)


def clean_text(raw):
    text = raw.replace("\r\n", "\n")
    text = PAGE_LINE.sub("", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    paragraphs = re.split(r"\n\s*\n", text)
    cleaned = []
    for paragraph in paragraphs:
        paragraph = re.sub(r"\s*\n\s*", " ", paragraph)
        paragraph = re.sub(r"[ \t]+", " ", paragraph).strip()
        if paragraph:
            cleaned.append(paragraph)
    return "\n\n".join(cleaned)
