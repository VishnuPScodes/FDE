# Common mistake

Base64url decoding exposes claims but does not authenticate them. An attacker can edit the payload and recompute its encoding without possessing the signing key.
