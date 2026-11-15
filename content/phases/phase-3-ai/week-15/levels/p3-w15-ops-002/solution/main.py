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


import re

PHONE = re.compile(r"(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def redact(text):
    text = EMAIL.sub("[email]", text)
    return PHONE.sub("[phone]", text)


def traced_llm_call(tracer, model, prompt, llm):
    preview = redact(prompt)[:40]
    with tracer.span("llm.call", model=model, prompt_preview=preview) as span:
        result = llm(model, prompt)
        span["attrs"]["input_tokens"] = result["input_tokens"]
        span["attrs"]["output_tokens"] = result["output_tokens"]
        span["attrs"]["total_tokens"] = result["input_tokens"] + result["output_tokens"]
        return result
