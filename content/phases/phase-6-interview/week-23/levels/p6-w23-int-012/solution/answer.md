# Decomposition: invoice errors

## Goal

Cut supplier invoice entry errors from 9% to 3% within 10 weeks, measured as the share of invoices that need a correction after posting in Tally.

## Users

Three accountants who key invoices, the finance head who approves payments, and suppliers who send invoices as PDFs and photos on WhatsApp. I assume accountants are comfortable with Excel but not with new tools.

## Data

Last year's posted invoices from Tally, the corrections log if one exists, the GSTIN master list, and the invoice images themselves. I assume corrections are not tagged by cause, so I would sample 200 and label them by hand first.

## Constraints

Small budget, accountants will not accept a slow tool at month end, supplier data is commercially sensitive, and GST rules must be followed exactly.

## MVP

A validation script before posting: check GSTIN format and checksum, flag duplicates by supplier plus invoice number plus amount, and flag amounts that differ from the purchase order. No LLM at first. Pilot on the top five suppliers only, because they cause most errors.

## Architecture

Invoice export from Tally -> Python validator -> a review sheet with flagged rows and the reason -> accountant fixes or confirms -> posting. Later, an LLM reads the PDF invoices to pre-fill fields, with the accountant always confirming.

## Risks

Too many false flags would be ignored; mitigation is to tune thresholds on last year's data and track the flag precision weekly. The LLM might misread an amount; mitigation is human review of every extracted field and a fallback to manual entry. Supplier data could leak; mitigation is masking names in any logs.

## Rollout

Two-week pilot with one accountant on five suppliers, compare error rate against the other two accountants, review weekly with the finance head, then add suppliers in batches of ten if errors fall by at least a third.
