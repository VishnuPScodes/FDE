import hashlib
import json


def cache_key(system, tools):
    prefix = json.dumps({"system": system, "tools": tools}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(prefix.encode("utf-8")).hexdigest()


def caching_cost(prefix_tokens, suffix_tokens, calls, input_usd_per_m, write_multiplier=1.25, read_multiplier=0.1):
    price = input_usd_per_m / 1_000_000
    without = calls * (prefix_tokens + suffix_tokens) * price
    if calls == 0:
        return (0.0, 0.0)
    prefix_cost = prefix_tokens * price * (write_multiplier + (calls - 1) * read_multiplier)
    with_cache = prefix_cost + calls * suffix_tokens * price
    return (round(without, 4), round(with_cache, 4))
