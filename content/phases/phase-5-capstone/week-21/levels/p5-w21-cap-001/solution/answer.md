# Architecture: clinic reminders

## Context

Sharma Physiotherapy keeps bookings in a Google Sheet. Patients use WhatsApp. The front desk has one laptop and no IT staff.

## Components

1. Google Sheet: the source of bookings and the place where replies are written back.
2. Reminder job: a small Python service on Render's free tier, run every 30 minutes.
3. WhatsApp Cloud API: sends template reminders and receives replies through a webhook.
4. Reply classifier: maps replies like "1", "haan" or "cancel" to confirm or cancel.
5. Usage log: one line per event in a log table on Supabase free tier.

## Data Flow

Sheet -> reminder job finds slots 24 h and 2 h away -> WhatsApp sends a reminder -> patient replies -> webhook -> classifier -> status column in the sheet -> Meena sees it.

## Failure Modes

If WhatsApp is down, the job logs the error and will retry on the next run. If it fails twice, Meena gets an email alert and falls back to manual calls for those patients. If a phone number is blank, the row is skipped and flagged in the sheet. If a reply is unclear, the status is set to "check" for a human to read.

## Cost

Render, Supabase and the first 1,000 WhatsApp service conversations each month are free. Expected cost: Rs 0.
