import re
from urllib.parse import urlparse

LINK = re.compile(r"(!?)\[([^\]]*)\]\(([^)\s]+)\)")


def strip_exfil(markdown, allowed_hosts):
    def fix(match):
        bang, text, url = match.groups()
        if url.startswith(("/", "#")) or urlparse(url).hostname in allowed_hosts:
            return match.group(0)
        return "[image removed]" if bang else text

    return LINK.sub(fix, markdown)
