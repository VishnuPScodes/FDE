# Webhooks and signatures

A webhook is an HTTP request one service sends to tell another about an event. The receiver must treat each request as untrusted.

## Verify the exact bytes

The mock sender and receiver share a secret. The sender makes an HMAC-SHA256 signature from the exact request body. It sends the signature in `X-FDE-Signature`. The receiver makes the signature again and checks it before it handles the event. Changing one character changes the signature.

Do not trust an event just because its JSON looks right. Check the signature safely, check the data, and reject a bad signature with `401`.

## Prevent replays

A valid signed request can be copied and sent again. Keep each delivery ID and process it only once. Reject a repeated ID. In production, also check that the event is recent.

The signing secret here is a public training value. Store real secrets in a server-side secret manager. Never put them in browser code.
