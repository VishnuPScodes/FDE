FROM python:3.12 AS builder
RUN pip install requests
FROM python:3.12 AS runtime
COPY --from=builder /usr/local/lib /usr/local/lib
