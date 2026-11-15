# Five whys: missed appointments

## Problem
22% of booked appointments are no-shows at Sahyadri Family Clinic.

## Five whys
Why 1: Why do patients miss appointments? Reception says they forget.
Why 2: Why do they forget? The reminder SMS arrives between 11 pm and 1 am, when most people are asleep.
Why 3: Why does it arrive so late? The SMS job only starts after the nightly billing export finishes.
Why 4: Why does the billing export finish so late? It moved from 6 pm to 10 pm last year.
Why 5: Why did it move? A new GST report was added to the same export and nobody checked what depended on it.

## Root cause
The reminder job depends on the billing export schedule. When the export moved for the GST report, reminders were pushed past midnight.

## What to test first
Run the reminder job at 6 pm on its own, without waiting for billing. Test it for two weeks at one doctor's schedule and measure the no-show rate against the 22% baseline.
