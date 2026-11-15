# Full decomposition: discharge summaries

## Goal
Cut discharge summary writing from 35 minutes to under 15, and average discharge wait from 3 hours to under 2 hours, by 31 January.

## Users
Ward doctors write and sign summaries. Nurses collect medicines and clearances. The billing clerk needs the summary to close the bill. Patients and families are waiting.

## Data
Handwritten case sheets scanned as PDFs, lab reports exportable as PDF, and nurse notes typed daily. I assume the notes are mostly English with some Kannada words.

## Constraints
Patient data must stay on hospital servers or an India region under the DPDP Act. Ward wifi is patchy. Doctors must review every summary. Budget is ₹3 lakh.

## MVP
For the medical ward only, draft a summary from lab values and the nurse notes. The doctor edits and signs it. No billing integration yet.

## Architecture
Scanned PDFs go through text extraction. A drafting model hosted in India produces a draft in a web page. The doctor edits it, and the signed version is saved to the hospital record.

## Risks
A wrong drug dose in a draft could harm a patient, so the doctor signs every summary and drug names are highlighted. Handwriting may be misread, so the source image shows beside the draft.

## Rollout
Pilot in the medical ward with three doctors for three weeks. Continue if median writing time falls below 15 minutes and an audit finds no dose errors.

