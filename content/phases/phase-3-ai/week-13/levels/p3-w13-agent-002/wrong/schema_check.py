import re

# Common mistake: isinstance(True, int) is True, and extra fields are ignored.
TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict}


def validate_args(schema, args):
    if not isinstance(args, dict):
        return ["arguments must be an object"]
    errors = []
    properties = schema.get("properties", {})
    for field in schema.get("required", []):
        if field not in args:
            errors.append(f"missing required field: {field}")
    for key, value in args.items():
        rule = properties.get(key, {})
        expected = rule.get("type")
        if expected and not isinstance(value, TYPES[expected]):
            errors.append(f"{key} must be {expected}")
            continue
        if "enum" in rule and value not in rule["enum"]:
            errors.append(f"{key} must be one of: {', '.join(rule['enum'])}")
        if "pattern" in rule and not re.search(rule["pattern"], value):
            errors.append(f"{key} does not match pattern")
        if "minimum" in rule and value < rule["minimum"]:
            errors.append(f"{key} must be >= {rule['minimum']}")
        if "maximum" in rule and value > rule["maximum"]:
            errors.append(f"{key} must be <= {rule['maximum']}")
    return errors
