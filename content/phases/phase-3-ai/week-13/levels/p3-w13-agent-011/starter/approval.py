from dispatcher import dispatch

REFUND_LIMIT_INR = 10_000
ALWAYS_APPROVE = {"delete_customer", "close_account"}


def needs_approval(tool_call):
    name = tool_call["name"]
    if name in ALWAYS_APPROVE:
        return True
    if name == "refund_payment":
        amount = (tool_call.get("arguments") or {}).get("amount_inr")
        if type(amount) is not int:
            return True
        return amount > REFUND_LIMIT_INR
    return False


def execute_with_approval(tool_call, registry, approver, audit_log):
    reviewer = None
    if not needs_approval(tool_call):
        approval = "not_required"
        message = dispatch(tool_call, registry)
    else:
        try:
            decision = approver(tool_call) or {}
        except Exception:
            decision = {}
        reviewer = decision.get("reviewer", "unknown")
        if decision.get("approved") is True:
            approval = "approved"
            message = dispatch(tool_call, registry)
        else:
            approval = "denied"
            message = {
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "content": f"denied by reviewer {reviewer}: {decision.get('note', '')}",
                "is_error": True,
            }
    audit_log.append({
        "tool": tool_call["name"],
        "arguments": tool_call.get("arguments"),
        "approval": approval,
        "reviewer": reviewer,
    })
    return message
