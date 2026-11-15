def monthly_cost_usd(calls_per_day, avg_input_tokens, avg_output_tokens, pricing, days=30):
    per_call = (avg_input_tokens * pricing["input"] + avg_output_tokens * pricing["output"]) / 1_000_000
    return round(calls_per_day * per_call, 2)


def cheapest_model(models, calls_per_day, avg_input_tokens, avg_output_tokens):
    return max(models, key=lambda name: models[name]["input"])
