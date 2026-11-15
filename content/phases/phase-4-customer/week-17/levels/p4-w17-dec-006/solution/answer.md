# Full decomposition: clinic no-shows

## Goal
Reduce no-shows from 18% to 10% across all eight clinics within three months, measured from the booking system.

## Users
Front desk staff who book and call, doctors who lose slots, and patients who receive the reminder.

## Data
Bookings sit in desktop software on each front desk PC. I assume phone numbers are mostly right but consent for messages was never recorded.

## Constraints
Health data privacy and consent rules apply. Patients speak Telugu, Hindi and English. Front desks have no spare time and no IT staff.

## MVP
A WhatsApp reminder the evening before with Confirm and Reschedule buttons, for two clinics, for four weeks. Slots freed by reschedules go to a waiting list.

## Architecture
Nightly export -> message service -> patient reply -> sheet the front desk checks each morning. No change to the old software yet.

## Risks
Patients may ignore messages, so we compare against two similar clinics with no reminders. Wrong numbers may message strangers, so we verify numbers at the next visit. Staff may skip the sheet, so we show it on the morning checklist.

## Rollout
Weeks 1 to 4 in two clinics. If no-shows drop by 4 points or more, add three clinics. Review every Friday with the clinic managers.
