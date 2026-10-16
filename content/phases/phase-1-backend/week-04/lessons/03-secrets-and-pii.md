# Secrets and personal data

An API key or client secret can give its holder access to a service. Keep private credentials on a server or in a secret manager. Do not place them in browser code, source control, screenshots, or logs. A public key is safe to share only when its permissions are limited and the server enforces access rules.

Use a separate identity for each service. Grant only the permissions it needs, rotate credentials when they may have leaked, and remove old credentials.

Personal data includes details that can identify or contact a person, such as an email address or phone number. Collect only what the feature needs. Limit who can see it, set a retention period, and redact it from logs and error messages.
