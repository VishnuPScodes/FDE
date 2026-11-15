import json


def call_key(call):
    """Same tool + same arguments (in any key order) gives the same key."""
    return (call["name"], json.dumps(call.get("arguments") or {}, sort_keys=True))


def is_looping(calls, window=3):
    if window < 2:
        raise ValueError("window must be at least 2")
    if len(calls) < window:
        return False
    keys = [call_key(call) for call in calls[-window:]]
    return all(key == keys[0] for key in keys)


def loop_message(call, window=3):
    return (f"stopped: {call['name']} was called {window} times in a row with the same arguments. "
            "Try a different approach or ask the user.")
