# Common mistake: compares only the tool name, so looking up three different customers looks like a loop.
def call_key(call):
    return call["name"]


def is_looping(calls, window=3):
    return len(calls) >= window and len({call_key(c) for c in calls[-window:]}) == 1


def loop_message(call, window=3):
    return "stopped"
