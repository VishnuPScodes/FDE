import hashlib
import json


def dataset_version(rows):
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()[:12]


def diff_versions(old, new):
    o = {r["id"] for r in old}
    n = {r["id"] for r in new}
    return {"added": sorted(n - o), "removed": sorted(o - n), "changed": []}
