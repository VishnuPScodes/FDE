import json


def build_batch(tickets, model, system, max_tokens=200):
    return "\n".join(json.dumps({"custom_id": str(i), "params": {"model": model, "messages": [{"role": "user", "content": t["text"]}]}}) for i, t in enumerate(tickets))


def match_results(tickets, results_jsonl):
    rows = [json.loads(line) for line in results_jsonl.splitlines()]
    return {ticket["id"]: rows[i]["result"].get("message") for i, ticket in enumerate(tickets) if i < len(rows)}
