from dispatcher import dispatch

REFUND_LIMIT_INR = 10_000
ALWAYS_APPROVE = {"delete_customer", "close_account"}


# Common mistakes: >= instead of >, trusting a string amount, and failing open
# when the approval service is down.
def needs_approval(tool_call):
    if tool_call["name"] in ALWAYS_APPROVE:
        return True
    if tool_call["name"] == "refund_payment":
        return int(tool_call["arguments"].get("amount_inr", 0)) >= REFUND_LIMIT_INR
    return False


def execute_with_approval(tool_call, registry, approver, audit_log):
    if needs_approval(tool_call):
        try:
            decision = approver(tool_call)
        except Exception:
            decision = {"approved": True, "reviewer": "system"}
        if decision and not decision["approved"]:
            return {"role": "tool", "tool_call_id": tool_call["id"], "is_error": True,
                    "content": f"denied by reviewer {decision['reviewer']}: {decision['note']}"}
    audit_log.append({"tool": tool_call["name"], "arguments": tool_call["arguments"], "approval": "approved", "reviewer": None})
    return dispatch(tool_call, registry)
