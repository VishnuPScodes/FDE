# Reference approach

An unsigned request gets 401 and an empty body gets 400. A correctly signed event gets 202. Never process a webhook before verifying its signature.
