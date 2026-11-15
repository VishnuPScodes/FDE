import json


def build_batch(tickets, model, system, max_tokens=200):
    seen = set()
    lines = []
    for ticket in tickets:
        if ticket["id"] in seen:
            raise ValueError(f"duplicate ticket id {ticket['id']}")
        seen.add(ticket["id"])
        text = ticket["text"].strip()
        if not text:
            continue
        line = {
            "custom_id": f"ticket-{ticket['id']}",
            "params": {
                "model": model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": text}],
            },
        }
        lines.append(json.dumps(line, ensure_ascii=False))
    return "\n".join(lines)


def match_results(tickets, results_jsonl):
    by_id = {}
    for raw in results_jsonl.splitlines():
        if not raw.strip():
            continue
        row = json.loads(raw)
        result = row.get("result", {})
        text = None
        if result.get("type") == "succeeded":
            blocks = result.get("message", {}).get("content", [])
            text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
        by_id[row["custom_id"]] = text
    return {ticket["id"]: by_id.get(f"ticket-{ticket['id']}") for ticket in tickets}
