PRICES = {
    "small": {"input": 0.25, "output": 1.25},
    "large": {"input": 3.00, "output": 15.00},
}


def _raw_inr(model, usage, prices, usd_inr):
    price = prices[model]
    cached = usage.get("cached_input_tokens", 0)
    fresh = usage["input_tokens"] - cached
    usd = (fresh * price["input"] + cached * price["input"] * 0.1 + usage["output_tokens"] * price["output"]) / 1_000_000
    return usd * usd_inr


def call_cost_inr(model, usage, prices, usd_inr=83.0):
    return round(_raw_inr(model, usage, prices, usd_inr), 4)


def cost_report(calls, prices, usd_inr=83.0):
    by_model = {}
    for call in calls:
        by_model[call["model"]] = by_model.get(call["model"], 0.0) + _raw_inr(call["model"], call["usage"], prices, usd_inr)
    return {
        "total_inr": round(sum(by_model.values()), 4),
        "by_model": {name: round(value, 4) for name, value in by_model.items()},
    }
