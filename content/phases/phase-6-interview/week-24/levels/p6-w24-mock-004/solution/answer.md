# Mock: decomposition for a pharmacy chain

## Goal
Cut expiry write-offs from ₹40 lakh to ₹25 lakh a year, while stock-outs of the top 100 medicines stay under 4% of store days, measured over six months.

## Users
Store pharmacists who order, warehouse planners who allocate stock, and the purchase head who owns the budget and reviews write-offs.

## Data
Daily sales from billing software, batch and expiry dates from the warehouse. I assume expiry data is complete for the warehouse but patchy at store level, and that stores use different product names.

## Constraints
Some medicines are controlled by law. Pharmacists are busy and see limited screens. Internet is slow in a few stores. The budget is modest, and we cannot reduce stock of life saving medicines.

## MVP
A weekly report for 10 stores listing medicines expiring within 90 days with a suggestion to transfer them to a busier store. Pharmacists approve each transfer. No forecasting yet.

## Architecture
Billing and warehouse exports -> cleaned stock table -> expiry rule and nearest busy store -> report in a shared sheet -> pharmacist approves -> transfer note to the warehouse.

## Risks
Wrong batch data could suggest a bad transfer, so pharmacists check the batch on the shelf. Transfers add cost, so we only suggest when savings exceed the transport cost. Stores may ignore reports, so the purchase head reviews the transfer rate weekly.

## Rollout
Eight week pilot in 10 stores, compared to 10 similar stores. If write-offs fall by 20% and stock-outs do not rise, extend to 30 stores and then add demand forecasting in phase 2.
