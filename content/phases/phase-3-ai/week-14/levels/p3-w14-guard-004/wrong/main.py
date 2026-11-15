import re


def check_message(text, rules):
    for rule in rules:
        if re.search(rule["pattern"], text):
            return {"action": rule["action"], "reasons": [rule["name"]]}
    return {"action": "allow", "reasons": []}
