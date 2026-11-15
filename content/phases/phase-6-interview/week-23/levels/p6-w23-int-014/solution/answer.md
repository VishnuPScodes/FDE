# Rewrite: a project that failed

## Situation

In a practice pilot for a three-doctor clinic in Pune, my WhatsApp reminder bot sent appointment reminders to 200 patients, and 31% of them still missed their visit in week one.

## Task

I owned the bot and the pilot result, and I had to find out why reminders were not working before the clinic lost trust.

## Action

I first checked the delivery logs and saw that 18% of messages were never read. I called five patients and learned that the reminders arrived at 6 am and in English, and many older patients did not notice them. I asked the front desk which hour patients actually check their phones and was told the evening before. I rewrote the templates in Marathi and English, moved the send time to 7 pm the day before, and added a one-tap reschedule button. I tested the new version with 20 staff relatives first, fixed a button bug, and then released it to everyone. I also sent the clinic owner a short note about what had gone wrong so there were no surprises.

## Result

No-shows fell from 31% to 14% over the next three weeks, and the front desk saved about 5 hours a week on reminder calls.

## Lesson

Next time I would test message language and timing with a handful of real patients before the pilot, not after the first failure.
