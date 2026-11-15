# Write a one-page design doc

## Context
Loan officers at the Thrissur branch spend about 45 minutes checking each of 400 files a month, mostly looking for missing pages. Delays frustrate applicants and the manager. The bank wants a faster first check without changing its core software.

## Goals
Cut average checking time from 45 to 20 minutes. Keep wrongly flagged files under 5%. Officers use the tool for every new file during the pilot.

## Non-goals
We will not change the core banking software. We will not make loan approval decisions. We will not read Tamil or Hindi forms in this phase. We will not process old files.

## Proposed design
First, a folder watcher picks up each new scanned file. Second, a page reader identifies page types. Third, rules compare the pages against the checklist for the loan type. Fourth, the officer sees a list of missing items with the reason. Officers can mark a flag wrong, and we log that. The reader runs inside the bank network.

## Alternatives considered
A ready document tool costs about ₹6 lakh a year and does not read Malayalam forms. A manual checklist sheet is cheap but only saves about 5 minutes. Hiring one more clerk costs more each month and does not scale. We chose the custom checker because it fits both the cost and the languages.

## Open questions
Can the bank share fifty sample files with names removed? Who signs off on the checklist for each loan type? Where can the reader run inside the network?
