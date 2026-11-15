import pytest

from loops import call_key, is_looping, loop_message

SEARCH = {"name": "search_orders", "arguments": {"customer_id": "CUST-7", "status": "open"}}
SAME_REORDERED = {"name": "search_orders", "arguments": {"status": "open", "customer_id": "CUST-7"}}
OTHER = {"name": "search_orders", "arguments": {"customer_id": "CUST-8", "status": "open"}}


def test_call_key_ignores_argument_order():
    assert call_key(SEARCH) == call_key(SAME_REORDERED)
    assert call_key(SEARCH) != call_key(OTHER)
    assert call_key({"name": "ping"}) == call_key({"name": "ping", "arguments": None}) == ("ping", "{}")


def test_three_identical_calls_in_a_row_is_a_loop():
    assert is_looping([SEARCH, SEARCH, SEARCH]) is True


def test_argument_key_order_does_not_matter():
    assert is_looping([SEARCH, SAME_REORDERED, SEARCH]) is True


def test_different_arguments_are_progress():
    assert is_looping([SEARCH, OTHER, SEARCH]) is False
    assert is_looping([OTHER, SEARCH, SEARCH]) is False


def test_only_the_last_window_counts():
    assert is_looping([OTHER, SEARCH, SEARCH, SEARCH]) is True


def test_too_few_calls():
    assert is_looping([SEARCH, SEARCH]) is False
    assert is_looping([]) is False


def test_missing_arguments_are_treated_as_empty():
    ping = {"name": "ping"}
    assert is_looping([ping, {"name": "ping", "arguments": {}}, {"name": "ping", "arguments": None}]) is True


def test_custom_window_and_validation():
    assert is_looping([SEARCH, SEARCH], window=2) is True
    with pytest.raises(ValueError):
        is_looping([SEARCH], window=1)


def test_message_names_the_tool_and_count():
    assert loop_message(SEARCH, window=4) == (
        "stopped: search_orders was called 4 times in a row with the same arguments. "
        "Try a different approach or ask the user.")
