import re


def strip_exfil(markdown, allowed_hosts):
    return re.sub(r"!\[[^\]]*\]\(http[^)]*evil[^)]*\)", "", markdown)
