def chunk_by_headings(markdown, max_chars=300):
    return [{"heading": "", "text": markdown[i:i + max_chars]} for i in range(0, len(markdown), max_chars)]
