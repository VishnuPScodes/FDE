import re

HEADING = re.compile(r"#+\s+(.*)")


def chunk_by_headings(markdown, max_chars=300):
    sections = [["", []]]
    for line in markdown.splitlines():
        match = HEADING.match(line)
        if match:
            sections.append([match.group(1).strip(), []])
        else:
            sections[-1][1].append(line)
    chunks = []
    for heading, lines in sections:
        paragraphs = [p.strip() for p in "\n".join(lines).split("\n\n") if p.strip()]
        current = ""
        for paragraph in paragraphs:
            if not current:
                current = paragraph
            elif len(current) + 2 + len(paragraph) <= max_chars:
                current += "\n\n" + paragraph
            else:
                chunks.append({"heading": heading, "text": current})
                current = paragraph
        if current:
            chunks.append({"heading": heading, "text": current})
    return chunks
