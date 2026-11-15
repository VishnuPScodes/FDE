"""A scripted stand-in for a real LLM.

Real models are slow, cost money, and can answer differently each run.
For practice, this fake model follows a script instead. Each call to
`complete()` returns the next scripted reply. Your code decides what to do
with that reply, and that is the part the tests grade.

Message shapes used everywhere in this course:

    {"role": "system" | "user", "content": "..."}
    {"role": "assistant", "content": "...", "tool_calls": [ToolCall, ...]}
    {"role": "tool", "tool_call_id": "call_1", "content": "...", "is_error": False}

A ToolCall is {"id": "call_1", "name": "get_claim_status", "arguments": {...}}.
A reply from `complete()` is {"content": str, "tool_calls": [...], "usage": {...}}.
You do not need to edit this file.
"""
import copy


class TransientError(Exception):
    """A temporary model failure, such as HTTP 429 or 503. Retrying may work."""

    def __init__(self, message="model overloaded", retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after


def count_tokens(messages):
    """A rough token count: one token per word of content."""
    return sum(len(str(message.get("content", "")).split()) for message in messages)


class FakeLLM:
    def __init__(self, script, name="fake-model"):
        self.script = list(script)
        self.name = name
        self.calls = []

    def complete(self, messages, tools=None):
        """Record what the model was sent, then return the next scripted reply.

        A script step can be a reply dict, an exception to raise, or a function
        that receives the messages and returns a reply dict.
        """
        self.calls.append({"messages": copy.deepcopy(messages), "tools": copy.deepcopy(tools)})
        if not self.script:
            raise RuntimeError("FakeLLM script ran out: your code called the model more times than expected")
        step = self.script.pop(0)
        if callable(step):
            step = step(copy.deepcopy(messages))
        if isinstance(step, BaseException):
            raise step
        reply = copy.deepcopy(step)
        reply.setdefault("content", "")
        reply.setdefault("tool_calls", [])
        reply.setdefault("usage", {
            "input_tokens": count_tokens(messages),
            "output_tokens": len(reply["content"].split()),
        })
        return reply


def say(text):
    """A scripted final answer with no tool calls."""
    return {"content": text, "tool_calls": []}


def call(name, arguments, call_id="call_1"):
    """A scripted reply that asks for one tool call."""
    return {"content": "", "tool_calls": [{"id": call_id, "name": name, "arguments": arguments}]}


def calls(*tool_calls):
    """A scripted reply that asks for several tool calls at once.

    Pass (call_id, name, arguments) tuples.
    """
    return {"content": "", "tool_calls": [
        {"id": call_id, "name": name, "arguments": arguments} for call_id, name, arguments in tool_calls
    ]}
