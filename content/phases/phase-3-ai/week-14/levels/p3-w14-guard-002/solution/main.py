import json
import re


class GuardrailError(Exception):
    pass


def _problems(data, schema):
    if not isinstance(data, dict):
        return "Expected a JSON object"
    found = []
    for key, expected in schema.items():
        if key not in data:
            found.append(f"Missing key: {key}")
            continue
        value = data[key]
        bad = not isinstance(value, expected) or (expected is int and isinstance(value, bool))
        if bad:
            found.append(f"Key {key} must be {expected.__name__}")
    return "; ".join(found)


def get_valid_json(ask, schema, max_tries=3):
    feedback = None
    for _ in range(max_tries):
        reply = ask(feedback).strip()
        fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", reply, re.DOTALL)
        if fenced:
            reply = fenced.group(1)
        try:
            data = json.loads(reply)
        except ValueError as error:
            feedback = f"Invalid JSON: {getattr(error, 'msg', error)}"
            continue
        feedback = _problems(data, schema)
        if not feedback:
            return data
    raise GuardrailError(f"Gave up after {max_tries} tries: {feedback}")
