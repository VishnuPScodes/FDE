# Hardening report

## Top Issues

1. Unclear replies sent to "check": 46 times in two weeks, mostly voice notes and emojis.
2. Reminder sent for slots already cancelled: 9 times, because the job read the sheet before Meena updated it.
3. Free service asleep at 8 am, first reminder late: 5 times.

## Fixes Shipped

Voice notes and thumbs-up emoji now get a short auto-reply asking to press 1 or 2. I tested it on 20 real past replies; unclear cases fell from 46 to 11. The job now re-reads a row just before sending, verified with three cancelled test slots. A scheduled ping at 7:50 am keeps the service awake.

## Not Fixed Yet

Patients who reply after the slot time still create a "check" row. Meena clears these by hand, about two a day.
