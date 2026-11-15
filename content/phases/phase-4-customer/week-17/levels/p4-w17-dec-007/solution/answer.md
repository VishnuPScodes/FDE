# Full decomposition: medicine stock-outs

## Goal
Cut stock-outs of the top 100 medicines from 9% of store days to 4% in three months, without raising expired stock write-offs.

## Users
Store pharmacists who order, the warehouse manager who ships, and the purchase head who sets budgets.

## Data
Daily sales exports from billing software, plus warehouse stock sheets. I assume sheets have different formats per store and some days are missing.

## Constraints
Medicines have expiry dates and some are controlled by law. Pharmacists have little time. Internet is weak in two towns. Budget is limited.

## MVP
A weekly suggested order list for 100 fast-moving medicines in five stores, based on the last eight weeks of sales. Pharmacists edit before sending. No automation of orders yet.

## Architecture
Sales export -> clean and combine -> simple demand rule -> suggested list in a sheet -> pharmacist edit -> order to warehouse.

## Risks
Festivals and seasons change demand, so pharmacists can override. Bad data may give odd numbers, so we flag stores with missing days. Over ordering may increase expiry, so we cap quantities by shelf life.

## Rollout
Six week pilot in five stores. Compare stock-outs against five similar stores. If stock-outs fall by 3 points and expiry does not rise, roll out to ten more stores.
