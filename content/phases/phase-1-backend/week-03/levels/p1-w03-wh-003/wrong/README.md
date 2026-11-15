# Common mistake

Accepting a webhook whose body changed after signing, or "fixing" a 401 by disabling signature checks. Always verify the HMAC against the exact received body and re-sign legitimate changes.
