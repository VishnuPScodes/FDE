TOOLS = {
    "get_claim_status": "read",
    "search_policy_docs": "read",
    "update_claim_note": "write",
    "approve_claim": "write",
    "send_email": "external",
}


def decide(tool, tainted, approved=False):
    return "allow"


class Session:
    def __init__(self):
        self.tainted = False

    def see(self, text, trusted):
        self.tainted = not trusted

    def check(self, tool, approved=False):
        return decide(tool, self.tainted, approved)
