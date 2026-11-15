from server import TOOLS, err, handle

# Each token maps to the scopes it was granted. In production these come from
# your identity provider (OAuth) instead of a dict.
TOKENS = {
    "tok-whatsapp-bot": {"claims:read"},
    "tok-claims-officer": {"claims:read", "claims:write"},
}


def handle_with_auth(request, token):
    """Check the caller's token and scopes, then pass the request to handle()."""
    # TODO
    return handle(request)
