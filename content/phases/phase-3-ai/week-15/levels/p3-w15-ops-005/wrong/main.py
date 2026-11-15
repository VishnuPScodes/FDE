PRICES = {
    "small": {"input": 0.25, "output": 1.25},
    "large": {"input": 3.00, "output": 15.00},
}


def call_cost_inr(model, usage, prices, usd_inr=83.0):
    price = prices[model]
    usd = (usage["input_tokens"] * price["input"] + usage["output_tokens"] * price["output"]) / 1000
    return round(usd * usd_inr, 4)


def cost_report(calls, prices, usd_inr=83.0):
    costs = [call_cost_inr(c["model"], c["usage"], prices, usd_inr) for c in calls]
    return {"total_inr": round(sum(costs), 4), "by_model": {}}
