import re

RULES = [
    ("ignore_previous", r"ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts?)"),
    ("role_override", r"\byou\s+are\s+now\b"),
    ("reveal_prompt", r"(reveal|show|print|repeat)\s+(me\s+)?(your|the)\s+(system\s+)?prompt"),
    ("exfil_url", r"!\[[^\]]*\]\(https?://[^)]*\?[^)]*\)"),
]

INVISIBLE = "[\u200b\u200c\u200d\u2060\ufeff]"


def find_signals(text):
    cleaned = re.sub(INVISIBLE, "", text)
    return [name for name, pattern in RULES if re.search(pattern, cleaned, re.IGNORECASE)]
