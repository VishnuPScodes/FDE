import hashlib
import json


def cache_key(system, tools):
    return hashlib.sha256((system + json.dumps(tools)).encode()).hexdigest()


def caching_cost(prefix_tokens, suffix_tokens, calls, input_usd_per_m, write_multiplier=1.25, read_multiplier=0.1):
    price = input_usd_per_m / 1_000_000
    without = calls * (prefix_tokens + suffix_tokens) * price
    with_cache = calls * (prefix_tokens * read_multiplier + suffix_tokens) * price
    return (round(without, 4), round(with_cache, 4))
