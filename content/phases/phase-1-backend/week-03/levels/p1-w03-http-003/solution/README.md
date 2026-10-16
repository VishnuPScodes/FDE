# Reference approach

The first request returns 429 and a `Retry-After` value of one second. Wait for that interval, retry the GET request, and confirm the second response is 200.
