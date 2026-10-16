# JWTs, scopes, and access control

A JSON Web Token has three parts: header, payload, and signature. Decoding shows the data but does not prove that the token is safe. Check the signature with a key from a trusted issuer. Then check who sent it (`iss`), who it is for (`aud`), and when it expires (`exp`). For OIDC, also check the nonce.

Scopes say what a client may do. Ask for only the scopes the task needs. An API should check the token each time it gets a request. It should also check the user's role and access to the data. A decoded claim alone does not grant access.

The demo provider signs tokens with HS256 in this browser. This lets you see how checks work. Never put a real signing secret in browser code.
