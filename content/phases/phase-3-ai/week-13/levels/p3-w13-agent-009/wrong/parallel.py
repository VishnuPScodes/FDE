from dispatcher import dispatch


# Common mistake: stopping at the first error, so later calls get no result.
def execute_tool_calls(tool_calls, registry):
    results = []
    for tool_call in tool_calls:
        message = dispatch(tool_call, registry)
        results.append(message)
        if message["is_error"]:
            break
    return results
