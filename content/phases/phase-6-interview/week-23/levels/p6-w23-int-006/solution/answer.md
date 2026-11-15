# Decomposition: circular assistant

## Goal

Reduce policy queries phoned to regional offices by 40% within 3 months, while every answer cites the exact circular and paragraph.

## Users

Branch officers and managers who ask questions, regional office staff who answer escalations, and the compliance team who owns circulars.

## Data

About 3,000 circulars as PDFs, some scanned, in English and Hindi. Each has a number, date and often a line saying which earlier circular it replaces. I assume the supersession data is not in a clean table.

## Constraints

Data cannot leave the bank's network, so the model must be hosted on-premise or in an approved private cloud. Answers must be traceable for audit. Staff use shared desktops with old browsers.

## MVP

Search and answer over circulars from the last two years for one topic, such as KYC, with citations and a "superseded" warning. If confidence is low, it shows the top three circulars instead of an answer.

## Architecture

PDF ingestion with OCR -> chunk by paragraph with circular number and date -> supersession table built and reviewed by compliance -> hybrid search (keyword plus embeddings) filtered to valid circulars -> on-prem LLM writes a short answer with citations -> feedback button and query log.

## Risks

Wrong or outdated answers; mitigation is filtering out superseded circulars, mandatory citations and human review of a weekly sample. OCR errors on scans; mitigation is a fallback to showing the source PDF. Low adoption; mitigation is training champions in each region.

## Rollout

Pilot in 50 branches of one region for 4 weeks on KYC questions, compare call volume with a similar region, then add topics and regions in phases.
