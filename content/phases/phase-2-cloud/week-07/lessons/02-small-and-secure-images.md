# Smaller images and safer defaults

Use a slim base when the application needs a full language runtime, and use a multi-stage build when compile tools are not needed at runtime. Copy build outputs into a clean runtime stage. Keep build-only packages out of the final image.

Containers run as root by default. Add a dedicated USER instruction with a non-root account or numeric UID. This reduces the impact of an application compromise. Do not copy secrets into an image layer; pass runtime configuration through environment variables or a secret manager.

The simulator makes base image sizes, added package layers, the final stage, and the configured user visible. Its sizes are teaching estimates, not registry measurements.
