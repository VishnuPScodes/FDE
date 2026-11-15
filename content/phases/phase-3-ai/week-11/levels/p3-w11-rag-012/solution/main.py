import html
import re

MARKER = re.compile(r"\[([A-Za-z0-9_.:-]+#\d+)\]")


def build_context(chunks):
    return "\n".join(f'<chunk id="{chunk["id"]}">{html.escape(chunk["text"], quote=False)}</chunk>' for chunk in chunks)


def check_citations(answer, chunks):
    known = {chunk["id"] for chunk in chunks}
    cited = []
    for marker in MARKER.findall(answer):
        if marker not in cited:
            cited.append(marker)
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.?!])\s+", answer)]
    return {
        "cited": cited,
        "unknown": [item for item in cited if item not in known],
        "uncited_sentences": [s for s in sentences if s and not MARKER.search(s)],
    }
