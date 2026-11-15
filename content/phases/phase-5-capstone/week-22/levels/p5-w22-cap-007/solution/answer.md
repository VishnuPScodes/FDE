# Case study: halving no-shows at a Pune physiotherapy clinic

## Context

Sharma Physiotherapy is a three-therapist clinic in Kothrud, Pune. It sees about 50 patients a day at Rs 800 a session. Bookings live in one Google Sheet. The front desk lead, Meena, phoned every patient each morning to remind them. Even so, close to one in five did not come.

## Discovery

I met Dr. Anjali and Meena for 40 minutes and then watched one Monday morning at the desk. Meena made 41 calls in just under three hours. The sheet showed 187 no-shows out of 1,040 booked slots over four weeks, or 18%. They had tried vendor SMS reminders before, at Rs 2,000 a month, and patients ignored them. Meena said, "Monday mornings are just phone calls." Data stayed in the clinic's Google account, and patients would opt in at booking.

## Decomposition

The goal was fewer no-shows and fewer calls. Users were patients and Meena. The data was the booking sheet. Constraints were no budget, no IT staff and patient consent. The MVP was a WhatsApp reminder with confirm and cancel buttons, with replies written back to the sheet. Payments, exercise videos and a mobile app went out of scope.

## Architecture

A small Python job on Render's free tier reads the sheet every 30 minutes. It sends WhatsApp templates 24 and 2 hours before each slot. Replies come back to a webhook, a rule-based classifier maps them to confirm, cancel or check, and the result goes into the sheet. Every event writes a usage line without personal data. A health route and a daily ping keep it alive. Monthly cost is zero.

## What Broke

In week one, two older patients misread the English reminder and came on the wrong day. Meena asked for Marathi reminders. I logged it as a change request, deferred a doctor-wise report and shipped Marathi templates in two days. Later, the logs showed 46 unclear replies, mostly voice notes. I added an auto-reply asking for 1 or 2, which cut unclear cases to 11. I learned to read the logs every evening instead of waiting for complaints.

## Impact

Before, from 13 Oct to 9 Nov, the no-show rate was 18.0%. After, from 17 Nov to 14 Dec, it was 9.0%. That is a drop of 9 percentage points, or half. Morning calls fell from about 3 hours to 40 minutes. Diwali was inside the before window, so I also compared with a normal week: 16% before against 9% after. Dr. Anjali said: "Meena spends her mornings with patients now, not on the phone."

## What I'd Do Next

I would add the Monday summary of cancellations by therapist that Dr. Anjali asked for. I would also try filling cancelled slots from the waiting list automatically. The system still runs, owned by the clinic, and I check the health page once a week.
