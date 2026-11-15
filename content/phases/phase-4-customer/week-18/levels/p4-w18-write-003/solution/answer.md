# Write the rollout and rollback plan

## Rollout
Week 1: reminders to staff phones only, to check the text. Weeks 2 to 3: two clinics send to real patients who gave consent. Week 4: review results with the clinic managers. Week 5 onward: add three more clinics if the numbers are good.

## Rollback
One setting stops all outgoing messages within five minutes. The clinic manager or our engineer can pause it. If paused, front desk goes back to phone calls, which still work. No booking data is changed by the reminders, so nothing needs to be restored.

## Monitoring
We watch delivery failures, patient replies, opt outs and complaints each day. If more than 3% of patients opt out or any patient complains about a wrong number, we pause and review that day. We also track no-show rate weekly against the two clinics without reminders.
