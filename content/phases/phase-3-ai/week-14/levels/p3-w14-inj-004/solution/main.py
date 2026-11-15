TOOLS = {
    "get_claim_status": "read",
    "search_policy_docs": "read",
    "update_claim_note": "write",
    "approve_claim": "write",
    "send_email": "external",
}


def decide(tool, tainted, approved=False):
    effect = TOOLS.get(tool)
    if effect is None:
        return "deny"
    if effect == "read":
        return "allow"
    if effect == "write":
        return "allow" if (not tainted or approved) else "ask"
    if effect == "external":
        if tainted:
            return "deny"
        return "allow" if approved else "ask"
    return "deny"


class Session:
    def __init__(self):
        self.tainted = False

    def see(self, text, trusted):
        if not trusted:
            self.tainted = True

    def check(self, tool, approved=False):
        return decide(tool, self.tainted, approved)
