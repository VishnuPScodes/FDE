def chunk_words(doc_id, text, size, overlap):
    words = text.split()
    chunks = []
    for n, start in enumerate(range(0, len(words), size - overlap)):
        chunks.append({"id": f"{doc_id}#{n}", "text": " ".join(words[start:start + size]), "start": start})
    return chunks
