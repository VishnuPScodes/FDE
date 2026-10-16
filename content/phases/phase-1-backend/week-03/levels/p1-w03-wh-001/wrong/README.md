# Common mistake

Signing one payload and then editing its JSON changes the bytes and invalidates the HMAC. Sign the final request body immediately before sending.
