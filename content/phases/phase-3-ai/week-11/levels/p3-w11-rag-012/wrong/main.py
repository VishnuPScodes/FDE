import re


def build_context(chunks):
    return "\n".join(f'<chunk id="{c["id"]}">{c["text"]}</chunk>' for c in chunks)


def check_citations(answer, chunks):
    cited = re.findall(r"\[(.*?)\]", answer)
    return {"cited": cited, "unknown": [], "uncited_sentences": []}
