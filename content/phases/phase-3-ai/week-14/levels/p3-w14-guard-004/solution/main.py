import re

SEVERITY = {"allow": 0, "escalate": 1, "block": 2}


def check_message(text, rules):
    action = "allow"
    reasons = []
    for rule in rules:
        if re.search(rule["pattern"], text, re.IGNORECASE):
            reasons.append(rule["name"])
            if SEVERITY[rule["action"]] > SEVERITY[action]:
                action = rule["action"]
    return {"action": action, "reasons": reasons}
