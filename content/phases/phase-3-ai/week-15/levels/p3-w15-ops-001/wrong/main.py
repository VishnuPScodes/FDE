from contextlib import contextmanager


class Tracer:
    def __init__(self, clock):
        self.clock = clock
        self.spans = []

    @contextmanager
    def span(self, name, **attrs):
        record = {
            "id": len(self.spans) + 1,
            "parent_id": None,
            "name": name,
            "start": self.clock(),
            "duration_ms": None,
            "attrs": dict(attrs),
            "status": "ok",
        }
        self.spans.append(record)
        try:
            yield record
        except Exception as exc:
            record["status"] = "error"
            record["attrs"]["error"] = str(exc)
        finally:
            record["duration_ms"] = self.clock() - record["start"]
