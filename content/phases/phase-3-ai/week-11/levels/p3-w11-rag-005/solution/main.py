import math
import re
import zlib

TOKEN = re.compile(r"[a-z0-9\u0900-\u097f]+")


def tokenize(text):
    return TOKEN.findall(text.lower())


def hashed_vector(text, dim=32):
    vector = [0.0] * dim
    for token in tokenize(text):
        vector[zlib.crc32(token.encode("utf-8")) % dim] += 1.0
    length = math.sqrt(sum(value * value for value in vector))
    if length == 0:
        return vector
    return [value / length for value in vector]
