def chunk_words(doc_id, text, size, overlap):
    if size <= 0 or overlap < 0 or overlap >= size:
        raise ValueError("need size > 0 and 0 <= overlap < size")
    words = text.split()
    chunks = []
    step = size - overlap
    start = 0
    while start < len(words):
        piece = words[start:start + size]
        chunks.append({"id": f"{doc_id}#{len(chunks)}", "text": " ".join(piece), "start": start})
        if start + size >= len(words):
            break
        start += step
    return chunks
