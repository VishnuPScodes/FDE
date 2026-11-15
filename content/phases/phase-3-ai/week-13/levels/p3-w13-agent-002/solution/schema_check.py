import re

TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict}


def _type_ok(value, expected):
    if expected in ("integer", "number") and isinstance(value, bool):
        return False
    return isinstance(value, TYPES[expected])


def validate_args(schema, args):
    """Return a list of error strings. An empty list means the args are valid."""
    if not isinstance(args, dict):
        return ["arguments must be an object"]
    errors = []
    properties = schema.get("properties", {})
    for field in schema.get("required", []):
        if field not in args:
            errors.append(f"missing required field: {field}")
    for key, value in args.items():
        rule = properties.get(key)
        if rule is None:
            if schema.get("additionalProperties") is False:
                errors.append(f"unexpected field: {key}")
            continue
        expected = rule.get("type")
        if expected and not _type_ok(value, expected):
            errors.append(f"{key} must be {expected}")
            continue
        if "enum" in rule and value not in rule["enum"]:
            errors.append(f"{key} must be one of: {', '.join(str(option) for option in rule['enum'])}")
        if "pattern" in rule and not re.search(rule["pattern"], value):
            errors.append(f"{key} does not match pattern")
        if "minimum" in rule and value < rule["minimum"]:
            errors.append(f"{key} must be >= {rule['minimum']}")
        if "maximum" in rule and value > rule["maximum"]:
            errors.append(f"{key} must be <= {rule['maximum']}")
    return errors
