import hashlib
import re

HOLE = re.compile(r"\{([a-z_][a-z0-9_]*)\}")


def render(template, variables):
    missing = sorted({name for name in HOLE.findall(template) if name not in variables})
    if missing:
        raise KeyError("missing: " + ", ".join(missing))
    return HOLE.sub(lambda match: str(variables[match.group(1)]), template)


def fingerprint(template):
    return hashlib.sha256(template.strip().encode("utf-8")).hexdigest()[:8]
