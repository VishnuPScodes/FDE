import copy

from memory import tokens, trim_history

SYSTEM = {"role": "system", "content": "You help customers of a Kerala logistics company."}


def tool_turn(call_id, result):
    return [
        {"role": "assistant", "content": "", "tool_calls": [{"id": call_id, "name": "track", "arguments": {}}]},
        {"role": "tool", "tool_call_id": call_id, "content": result, "is_error": False},
    ]


HISTORY = [
    SYSTEM,
    {"role": "user", "content": "Where is consignment KL-55?"},
    *tool_turn("call_1", "KL-55 left Kochi hub at 6 am today"),
    {"role": "assistant", "content": "It left Kochi this morning."},
    {"role": "user", "content": "And KL-56 to Thrissur?"},
    *tool_turn("call_2", "KL-56 is out for delivery in Thrissur"),
    {"role": "assistant", "content": "It is out for delivery."},
]


def total(messages):
    return sum(tokens(m) for m in messages)


def test_everything_fits():
    assert trim_history(HISTORY, 1000) == HISTORY


def test_system_kept_and_budget_respected():
    trimmed = trim_history(HISTORY, 30)
    assert trimmed[0] == SYSTEM
    assert total(trimmed) <= 30
    assert trimmed[-1] == HISTORY[-1]


def test_never_starts_with_an_orphan_tool_message():
    for budget in range(10, 60):
        trimmed = trim_history(HISTORY, budget)
        for index, message in enumerate(trimmed):
            if message["role"] == "tool":
                before = trimmed[index - 1]
                assert before["role"] in ("assistant", "tool"), f"orphan tool message at budget {budget}"
                if before["role"] == "assistant":
                    assert before.get("tool_calls")


def test_exact_cut():
    # system=9, unit sizes from newest: 5, 1+9=10, 5, 6, 5, 1+9=10, 6
    trimmed = trim_history(HISTORY, 9 + 5 + 10 + 5)
    assert trimmed == [SYSTEM] + HISTORY[5:]


def test_stops_at_first_unit_that_does_not_fit():
    # 9 + 5 + 10 = 24; the next unit (5 tokens) does not fit in 28, so stop
    # even though older units are small.
    trimmed = trim_history(HISTORY, 28)
    assert trimmed == [SYSTEM] + HISTORY[6:]


def test_newest_unit_always_kept():
    trimmed = trim_history(HISTORY, 3)
    assert trimmed == [SYSTEM, HISTORY[-1]]


def test_input_unchanged():
    before = copy.deepcopy(HISTORY)
    trim_history(HISTORY, 20)
    assert HISTORY == before
