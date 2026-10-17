# Run and debug containers

Use docker run --name api -d -p 8080:8000 app:local to start a detached container with a name and a port mapping. docker ps lists running containers; docker ps -a includes stopped ones. docker logs api shows container output. Stop a container before removing it.

Host ports cannot be bound twice. If a second container requests an occupied port, Docker reports a bind error. Check docker ps, change the host side of the mapping, or stop the container that owns the port.

The browser simulator keeps state only in your isolated workspace. It does not start operating-system containers or expose a service on your computer.
