import hashlib
import json


def dataset_version(rows):
    ordered = sorted(rows, key=lambda r: r["id"])
    blob = json.dumps(ordered, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:12]


def diff_versions(old, new):
    o = {r["id"]: r for r in old}
    n = {r["id"]: r for r in new}
    return {
        "added": sorted(n.keys() - o.keys()),
        "removed": sorted(o.keys() - n.keys()),
        "changed": sorted(i for i in o.keys() & n.keys() if o[i] != n[i]),
    }
