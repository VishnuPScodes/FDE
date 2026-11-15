"""A simulated MCP host for practice.

Real MCP hosts (Claude Desktop, IDEs, agent runtimes) talk to a server with
JSON-RPC 2.0 messages over stdio or HTTP. Here we skip the transport: the host
calls your `handle(request)` function with a request dict and checks the
response dict it gets back. You do not need to edit this file.
"""


class ProtocolViolation(AssertionError):
    """Raised when a server response breaks the JSON-RPC 2.0 rules."""


class MCPHost:
    def __init__(self, handler):
        self.handler = handler
        self.next_id = 0
        self.log = []

    def send(self, message):
        """Send any raw message and return the raw response (no checks)."""
        self.log.append(("->", message))
        response = self.handler(message)
        self.log.append(("<-", response))
        return response

    def request(self, method, params=None):
        """Send a request and return the checked response envelope."""
        self.next_id += 1
        message = {"jsonrpc": "2.0", "id": self.next_id, "method": method}
        if params is not None:
            message["params"] = params
        response = self.send(message)
        self._check(response, self.next_id)
        return response

    def notify(self, method, params=None):
        """Send a notification. A server must not answer it."""
        message = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        response = self.send(message)
        if response is not None:
            raise ProtocolViolation(f"server answered a notification: {response!r}")

    def result(self, method, params=None):
        """Send a request that must succeed, and return its result."""
        response = self.request(method, params)
        if "error" in response:
            raise ProtocolViolation(f"{method} failed: {response['error']}")
        return response["result"]

    def connect(self, protocol_version="2025-06-18"):
        """Run the MCP handshake: initialize, then notifications/initialized."""
        result = self.result("initialize", {
            "protocolVersion": protocol_version,
            "capabilities": {},
            "clientInfo": {"name": "practice-host", "version": "0.1"},
        })
        self.notify("notifications/initialized")
        return result

    @staticmethod
    def _check(response, expected_id):
        if not isinstance(response, dict):
            raise ProtocolViolation(f"response must be a dict, got {response!r}")
        if response.get("jsonrpc") != "2.0":
            raise ProtocolViolation('response needs "jsonrpc": "2.0"')
        if response.get("id") != expected_id:
            raise ProtocolViolation(f"response id {response.get('id')!r} does not match request id {expected_id}")
        if ("result" in response) == ("error" in response):
            raise ProtocolViolation("response needs exactly one of result or error")
        if "error" in response:
            error = response["error"]
            if not isinstance(error.get("code"), int) or not isinstance(error.get("message"), str):
                raise ProtocolViolation("error needs an int code and a str message")
