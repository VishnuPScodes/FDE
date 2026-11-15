# MVP and Architecture for a kirana distributor

## MVP
Pilot with ten shops for two weeks. Typed WhatsApp orders are read by a model and turned into a draft order list. A staff member checks the draft in a sheet before it goes into Tally. Voice notes and photos stay manual for now.

## Architecture
WhatsApp message -> webhook -> model extracts items and quantities -> draft order in a shared sheet -> staff review and fix -> export file -> Tally import. Every correction is saved so we can measure accuracy.
