# Compose and a simulated registry

Compose describes a local application as services. Services can refer to images and declare dependencies; docker compose up -d creates the service containers together. docker compose down removes those containers. This simulator supports a focused subset of Compose for service relationships and lifecycle practice.

The simulated registry is private to your current level. Tag an image with a registry host, log in to the simulated registry, then push it. Pushing before login gives a realistic permissions error. No image data is uploaded or pushed onto the public internet.
