# Threat model: RupeeRoute refunds

## What we protect
Customer phone numbers, UPI IDs, and the refund money itself, up to ₹2 lakh per day. Also the admin login that approves refunds.

## Entry points
The public refund API, the shopkeeper mobile app, the admin web panel, and the webhook from the bank partner. The database is only reachable from inside our network.

## Top threats
1. Spoofing: someone pretends to be a shopkeeper using a stolen login token.
2. Tampering: the refund amount is changed in the request, from ₹500 to ₹50,000.
3. Information disclosure: phone numbers or UPI IDs leak through logs or an error message.
4. Denial of service: a flood of requests blocks real shopkeepers.

## Controls
Short-lived tokens with a second check for large refunds. The server calculates the amount itself and ignores the one in the request. Mask phone numbers and UPI IDs in logs. Rate limit each shopkeeper and alert on a spike in 429 responses.

## Residual risk
A stolen phone with a valid session can still make small refunds up to the limit. The operations head accepts this and we review the limit every quarter.
