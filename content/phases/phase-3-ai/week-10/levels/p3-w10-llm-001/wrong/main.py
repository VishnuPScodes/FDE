import math


def estimate_tokens(text):
    return len(text) // 4


def call_cost_inr(input_tokens, output_tokens, input_usd_per_m, output_usd_per_m, inr_per_usd):
    usd = (input_tokens + output_tokens) * input_usd_per_m / 1_000_000
    return round(usd * inr_per_usd, 4)
