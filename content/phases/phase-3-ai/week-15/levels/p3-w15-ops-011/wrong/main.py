import hashlib
import re


def render(template, variables):
    out = template
    for name, value in variables.items():
        out = out.replace("{" + name + "}", str(value))
    return out


def fingerprint(template):
    return hashlib.sha256(template.encode("utf-8")).hexdigest()[:8]
