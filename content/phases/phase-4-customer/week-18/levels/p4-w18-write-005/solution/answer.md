# Explain the proposed design to a shop owner

## Proposed design
1. Your supplier emails the order list as usual.
2. The tool opens the email and reads each product line and quantity.
3. It fills the Excel sheet you already use for purchases.
4. You or your accountant check the sheet and approve it. Nothing is saved until a person says yes.
5. Once you approve, the sheet goes to Tally as it does today.

## What could go wrong
Risk one: the tool may misread a messy email. If it is unsure, it marks the line in yellow and a person fixes it before step 5. Risk two: a supplier changes the email layout. We will test five new emails each month and update the tool if more than one line in twenty is wrong.
