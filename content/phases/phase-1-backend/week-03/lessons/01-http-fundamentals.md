# HTTP API fundamentals

HTTP is the request and response format used by web APIs. A request has a method, a path, optional headers, and sometimes a body. A response has a status code, headers, and often a JSON body.

## Read the status first

- `2xx` means the request succeeded. `200 OK` is a common response to a read.
- `4xx` means the request needs attention. `404 Not Found` means the route or resource does not exist. `429 Too Many Requests` means slow down.
- `5xx` means the server failed. `500 Internal Server Error` may be temporary, so retry only when it is safe.

## Follow pagination

An API may return only a small page of a larger collection. Read fields such as `page`, `total_pages`, and `next_page`, then request the next page until there is no next page. Do not assume the first response contains every record.

## Retry carefully

For a `429`, follow the `Retry-After` header. For a temporary `5xx`, use a bounded retry policy with backoff. Avoid retrying a non-idempotent operation such as creating a payment unless the API supports an idempotency key.

The practice API at `api.fde.test` runs entirely in this browser. It never sends requests to the public internet.
