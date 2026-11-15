import json


class GuardrailError(Exception):
    pass


def get_valid_json(ask, schema, max_tries=3):
    return json.loads(ask(None))
