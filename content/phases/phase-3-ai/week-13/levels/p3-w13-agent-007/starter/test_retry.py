import pytest

from fake_llm import FakeLLM, TransientError, say
from retry import call_with_retry


class Recorder:
    def __init__(self):
        self.delays = []

    def __call__(self, seconds):
        self.delays.append(seconds)


def flaky(failures, error=None):
    state = {"calls": 0}

    def fn():
        state["calls"] += 1
        if state["calls"] <= failures:
            raise error or TransientError("503 overloaded")
        return "ok"

    fn.state = state
    return fn


def test_success_needs_no_sleep():
    sleep = Recorder()
    assert call_with_retry(lambda: "namaste", sleep=sleep) == "namaste"
    assert sleep.delays == []


def test_backoff_doubles():
    sleep = Recorder()
    fn = flaky(3)
    assert call_with_retry(fn, sleep=sleep) == "ok"
    assert sleep.delays == [0.5, 1.0, 2.0]
    assert fn.state["calls"] == 4


def test_delay_is_capped():
    sleep = Recorder()
    fn = flaky(4)
    assert call_with_retry(fn, max_attempts=5, base_delay=1, max_delay=3, sleep=sleep) == "ok"
    assert sleep.delays == [1, 2, 3, 3]


def test_retry_after_wins():
    sleep = Recorder()
    fn = flaky(1, TransientError("429 too many requests", retry_after=7))
    assert call_with_retry(fn, sleep=sleep) == "ok"
    assert sleep.delays == [7]


def test_gives_up_and_raises_last_error():
    sleep = Recorder()
    fn = flaky(10)
    with pytest.raises(TransientError):
        call_with_retry(fn, max_attempts=3, sleep=sleep)
    assert fn.state["calls"] == 3
    assert sleep.delays == [0.5, 1.0]


def test_other_errors_are_not_retried():
    sleep = Recorder()
    fn = flaky(1, ValueError("prompt too long"))
    with pytest.raises(ValueError):
        call_with_retry(fn, sleep=sleep)
    assert fn.state["calls"] == 1
    assert sleep.delays == []


def test_works_with_the_fake_model():
    sleep = Recorder()
    llm = FakeLLM([TransientError("503"), say("Your order ships today from Kochi.")])
    reply = call_with_retry(lambda: llm.complete([{"role": "user", "content": "Where is my order?"}]), sleep=sleep)
    assert reply["content"] == "Your order ships today from Kochi."
    assert sleep.delays == [0.5]
