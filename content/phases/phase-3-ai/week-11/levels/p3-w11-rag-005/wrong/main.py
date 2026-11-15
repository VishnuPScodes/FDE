import math
import re
import zlib


def tokenize(text):
    return text.split()


def hashed_vector(text, dim=32):
    vector = [0.0] * dim
    for token in tokenize(text):
        vector[hash(token) % dim] += 1.0
    return vector
