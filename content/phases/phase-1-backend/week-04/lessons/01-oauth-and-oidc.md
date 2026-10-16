# OAuth 2.0 and OpenID Connect

OAuth 2.0 lets a client get limited access to an API. OpenID Connect (OIDC) adds sign-in and user identity. An access token lets a client call an API. An ID token tells the client which user signed in.

## Authorization Code with PKCE

A browser app makes a random `code_verifier`. It sends a SHA-256 `code_challenge` to the sign-in page. After the user agrees, the provider returns a short-lived code that can be used once. The client sends the code and the original verifier to get tokens. The provider checks that the verifier matches the challenge.

The client also sends a random `state` value and checks it when the browser returns. OIDC adds a `nonce`. The client checks it in the ID token. These values tie the reply to the request and help stop fake or replayed replies.

## Client Credentials

Services use the client credentials flow when no user is involved. A service signs in with its own client ID and secret. It asks only for the scopes it needs. A browser app must not store a real client secret; this workspace uses demo values only.

Both flows here use a local simulator. Tokens use a demo HS256 key so you can read and check them. Real providers share public keys through JWKS.
