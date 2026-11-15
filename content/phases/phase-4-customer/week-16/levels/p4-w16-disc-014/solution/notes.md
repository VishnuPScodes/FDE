# Notes: Coastal Insurance Brokers, IT

## Systems
Policy data sits in an on-premise Oracle database from 2014. A CSV export lands on a shared drive every night at 2 am.

## Constraints
Outside vendors sign an NDA and work through the VPN, read-only. Approval takes about three weeks. Aadhaar and health data must stay in India under the IRDAI audit, so no public cloud calls with raw records.

## Trust
A past vendor ran a script on the live database without telling IT and locked the policy system for two hours. Suresh wants to be consulted before anything is connected.

## Next steps
Start the NDA and VPN approval this week. Plan the first pilot on the nightly CSV, not the live database, and share my access plan with Suresh before I touch anything.
