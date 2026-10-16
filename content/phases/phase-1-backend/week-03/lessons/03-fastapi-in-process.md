# Build an API with FastAPI

FastAPI links Python functions to HTTP methods and paths. A route says what the app should do for a request. The function returns data, and FastAPI turns it into an HTTP response. Type hints can read path values and check input.

## Test without a network server

An in-process ASGI client calls the app directly. Tests can check status codes and JSON without opening a port or using the internet. This workspace uses HTTPX `ASGITransport` and async tests. Pyodide cannot start threads, so write route handlers with `async def`; a regular `def` handler makes FastAPI use a thread pool.

The workspace loads FastAPI and HTTPX into Pyodide when you first run tests. Async test functions run on Pyodide's browser event loop. Your app cannot open network ports or call public services from here.
