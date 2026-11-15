# Mock: decomposition for a lending startup

## Goal
Cut application checking time from 45 to 20 minutes and cut the sent-back rate from 20% to 8% within 10 weeks.

## Users
Loan officers who check files, kirana owners who upload statements from their phones, and a credit manager who approves loans.

## Data
Bank statement PDFs and photos, past applications with their sent-back reasons, and officer notes. I assume most statements are scanned images of varying quality and that the sent-back reasons are free text.

## Constraints
Financial data is sensitive and must stay in India, officers will not trust unexplained scores, owners upload from low-end phones, and the credit decision must remain human.

## MVP
A missing-page checker: when an owner uploads a statement, check that all months are present and pages are readable, and ask for the missing pages on the spot. No credit scoring. Pilot with one branch only.

## Architecture
Upload page -> OCR and page count check -> rules that look for gaps in dates -> immediate message to the owner on WhatsApp -> complete file appears in the officer's queue with a checklist. An LLM later summarises transactions, with the officer confirming.

## Risks
OCR may fail on poor photos, so the mitigation is a manual review fallback and a retake prompt. Staff may feel replaced, so mitigation is to show that the checker removes boring work and keeps officers as decision makers. Data leaks are reduced by India-hosted storage and masked logs.

## Rollout
Four-week pilot at one branch with three officers, compare checking time and sent-back rate against another branch each week, then expand to two more branches if checking time falls below 30 minutes.
