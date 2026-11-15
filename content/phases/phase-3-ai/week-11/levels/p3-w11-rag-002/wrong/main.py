import re


def html_to_blocks(html_text):
    text = re.sub(r"<[^>]+>", "\n", html_text)
    return [line.strip() for line in text.splitlines() if line.strip()]
