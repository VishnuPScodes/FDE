def validate_headers(headers, required):
    return [name for name in required if name not in headers]
