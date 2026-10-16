# Reference approach

Generate a PKCE verifier and S256 challenge, use a random state and nonce, exchange the returned code with the original verifier and redirect URI, then verify the ID token and nonce.
