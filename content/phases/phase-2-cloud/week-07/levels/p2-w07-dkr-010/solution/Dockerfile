FROM python:3.12-slim
COPY app.py /app.py
HEALTHCHECK --interval=30s CMD python -c "print('ok')"
CMD ["python", "app.py"]
