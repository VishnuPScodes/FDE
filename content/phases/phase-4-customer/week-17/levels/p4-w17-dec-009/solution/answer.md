# Full decomposition: cold storage spoilage

## Goal
Cut monthly spoilage from 1.5% to 0.8% of stored stock value, about ₹1.2 lakh to ₹64,000 a month, by 30 September.

## Users
Four warehouse clerks log stock and need a one-screen list of lots nearing their limit. The manager needs a weekly spoilage report. Farmers want a message when their lot should be collected.

## Data
Paper registers at each warehouse, photographed weekly. Temperature logger files exist for two of four sites. I assume entry dates are readable but lot numbers are inconsistent.

## Constraints
Clerks use basic Android phones and speak Kannada. Power cuts break connectivity. Budget is under ₹2 lakh and nobody on site does IT.

## MVP
At one warehouse, clerks enter lot number and date on a phone form. A daily WhatsApp message then lists lots older than their storage limit. Run it for four weeks.

## Architecture
A phone form writes to a shared sheet. A scheduled script checks lot age against crop limits and sends the daily list through WhatsApp Business to the clerk and the manager.

## Risks
Clerks skip entry when busy, so entry will take two taps and the manager reviews gaps weekly. Wrong storage limits cause false alerts, so we confirm limits per crop with the manager first.

## Rollout
Pilot at the Hubli main warehouse for four weeks with two clerks. If pilot spoilage falls below 1% and clerks log over 90% of lots, extend to the other three warehouses.

