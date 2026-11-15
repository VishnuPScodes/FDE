def monthly_cost_usd(calls_per_day, avg_input_tokens, avg_output_tokens, pricing, days=30):
    calls = calls_per_day * days
    per_call = (avg_input_tokens * pricing["input"] + avg_output_tokens * pricing["output"]) / 1_000_000
    return round(calls * per_call, 2)


def cheapest_model(models, calls_per_day, avg_input_tokens, avg_output_tokens):
    return min(
        sorted(models),
        key=lambda name: monthly_cost_usd(calls_per_day, avg_input_tokens, avg_output_tokens, models[name]),
    )
