# Build a container image

An image is a read-only template made from ordered layers. A container is a running instance of an image. Docker reads instructions from a Dockerfile and applies them in order; each instruction can add a layer to the resulting image.

Start with a small trusted base, copy only application files, set the working directory, and make the default command explicit.

    FROM python:3.12-slim
    WORKDIR /app
    COPY app.py .
    CMD ["python", "app.py"]

The simulator tracks a rough image size so you can compare bases and layers. It does not download real images or execute arbitrary shell commands from RUN.
