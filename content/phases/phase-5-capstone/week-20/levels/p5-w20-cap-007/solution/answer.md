# Data-handling rules

## Data Sources

The clinic's booking Google Sheet: patient ID, name, phone, slot time and therapist.

## Personal Data

Patient name and phone number are personal data. Health details are not in the sheet, and we will not add them.

## Consent

Meena will ask each patient at booking: "Can we send you a WhatsApp reminder?" Only patients who say yes are marked opt-in. Others keep getting a phone call.

## Storage and Access

Data stays in the clinic's own Google account. The reminder script reads the sheet with a service account that only has access to that one sheet. I work on a copy with fake names during the build.

## Retention and Deletion

Message logs keep only patient ID and status, not names. Logs are deleted after 90 days. My access is removed when the project is handed over.
