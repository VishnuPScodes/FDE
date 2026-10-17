FROM python:3.12 AS builder
WORKDIR /src
COPY app.py .
RUN pip install --no-cache-dir requests
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /src/app.py .
USER 10001
CMD ["python", "app.py"]
