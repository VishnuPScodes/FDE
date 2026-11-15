# Full decomposition: outage call centre

## Goal
Cut average call wait from 9 minutes to 4 minutes by 31 March, by answering routine outage-status queries without an agent.

## Users
Twenty-five call agents want fewer repeat calls. Customers, mostly on feature phones, want to know when power returns. The duty engineer updates outage status and needs a simple way to do it.

## Data
An Excel outage list updated by the duty engineer every two hours, and call logs with agent notes in Odia and English. I assume consumer numbers map cleanly to feeders.

## Constraints
Odia language, feature phones so SMS or voice and not an app, slow public procurement, and customer data must stay in the state data centre.

## MVP
A customer texts their consumer number and gets the outage status and expected restore time in Odia. Run it for one district for four weeks.

## Architecture
An SMS gateway passes the consumer number to a small service. It looks up the feeder in the outage sheet and replies with an Odia template that includes the last updated time.

## Risks
Stale outage data gives wrong restore times, so every reply shows the update time and the engineer refreshes hourly. Customers may keep calling, so we print the SMS number on bills and the IVR.

## Rollout
Pilot in Khordha district for four weeks. If outage-status calls fall by 25% and complaints do not rise, extend to two more districts.

