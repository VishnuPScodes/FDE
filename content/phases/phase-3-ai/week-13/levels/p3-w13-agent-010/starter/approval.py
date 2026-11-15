from dispatcher import dispatch

REFUND_LIMIT_INR = 10_000
ALWAYS_APPROVE = {"delete_customer", "close_account"}


def needs_approval(tool_call):
    # TODO
    return False


def execute_with_approval(tool_call, registry, approver, audit_log):
    # TODO
    return dispatch(tool_call, registry)
