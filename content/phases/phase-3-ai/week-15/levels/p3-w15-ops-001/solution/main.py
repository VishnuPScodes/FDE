from contextlib import contextmanager


class Tracer:
    def __init__(self, clock):
        self.clock = clock
        self.spans = []
        self._stack = []

    @contextmanager
    def span(self, name, **attrs):
        record = {
            "id": len(self.spans) + 1,
            "parent_id": self._stack[-1]["id"] if self._stack else None,
            "name": name,
            "start": self.clock(),
            "duration_ms": None,
            "attrs": dict(attrs),
            "status": "ok",
        }
        self.spans.append(record)
        self._stack.append(record)
        try:
            yield record
        except Exception as exc:
            record["status"] = "error"
            record["attrs"]["error"] = str(exc)
            raise
        finally:
            record["duration_ms"] = self.clock() - record["start"]
            self._stack.pop()
