# Runbook: clinic reminders

## What It Does

Sends WhatsApp reminders to opt-in patients 24 hours and 2 hours before their slot, and writes their reply into the booking sheet.

## Daily Check

At 9 am, open the booking sheet. Today's rows should show "confirmed", "cancelled" or "check" in the status column. If the column is empty for everyone, see Common Problems.

## Common Problems

Statuses are empty: open https://clinic-reminders.onrender.com/health. If it does not say ok, wait one minute and refresh. Still down? Do the morning calls by hand as before and message Priya.

Many rows say "check": read those replies in WhatsApp and set the status by hand. This is normal for voice notes.

A patient says they got a reminder after cancelling: check that the sheet was updated before the reminder time.

## Contacts

Priya Kulkarni (built it): WhatsApp 98xxx xxxxx. Backup: Rohan (Dr. Anjali's nephew).

## Ownership Handover

Render, Supabase and the WhatsApp Business account are now in the clinic's Google account, owned by Dr. Anjali. The GitHub repo was transferred to the clinic's organisation. The API key was rotated on handover day and my access was removed on 15 Dec.
