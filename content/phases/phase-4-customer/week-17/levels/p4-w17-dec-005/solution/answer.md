# Full decomposition: loan file checking

## Goal
Cut loan file checking from 45 to 15 minutes per file by March, with no rise in errors found later.

## Users
Three loan officers who check files, a branch manager who approves, and an auditor who samples approved files each quarter.

## Data
Scanned PDFs in a shared folder, plus phone photos sent on WhatsApp. I assume file names are inconsistent and about one in five scans is hard to read.

## Constraints
Customer data is personal and financial, so nothing leaves the bank network without approval. Forms are in Malayalam and English. The budget is small and there is no data team.

## MVP
A checklist that reads new files and lists missing pages, such as no income proof or an unsigned form. Officers still decide. Only the Thrissur branch, only new files.

## Architecture
Folder watcher -> page reader -> checklist rules -> list of missing items -> officer screen. Officer corrections are stored to measure accuracy.

## Risks
Poor scans may be misread, so unclear pages go to a human. Staff may not trust it, so we show the reason for each flag. Data privacy is a concern, so the reader runs inside the bank network.

## Rollout
Four week pilot on one branch with two officers. Success means 30 minutes saved per file on average and fewer than 5% wrong flags. Then add the next branch.
