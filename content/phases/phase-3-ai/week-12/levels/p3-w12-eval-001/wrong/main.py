import json


def load_golden(text):
    return [json.loads(line) for line in text.splitlines()]
