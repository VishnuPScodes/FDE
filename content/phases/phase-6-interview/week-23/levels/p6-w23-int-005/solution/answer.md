# Decomposition: missed deliveries

## Goal

Cut first-attempt failed deliveries from 12% to 7% within 8 weeks, measured per route from the delivery app's status data.

## Users

Riders (Android phones, Malayalam and English), hub dispatchers who plan routes, and end customers who receive parcels.

## Data

Delivery records with status codes and failure reasons, customer addresses and phone numbers, rider GPS pings. I assume failure reasons are free text typed by riders and are messy.

## Constraints

Patchy mobile data in hilly areas, riders cannot type much while driving, customer phone numbers are personal data under the DPDP Act, and the budget is small.

## MVP

Classify the last three months of failure reasons to find the top cause. If "customer not available" leads, send a WhatsApp message the evening before with a confirm or reschedule button, on the three worst routes only.

## Architecture

Nightly job reads tomorrow's deliveries -> WhatsApp template -> customer reply -> webhook updates the delivery app -> dispatcher sees reschedules before routes are planned. An LLM classifies the old free-text failure reasons once, with a human checking a sample.

## Risks

Customers may ignore messages; mitigation is a fallback to the current process plus an A/B comparison with similar routes. The classifier may mislabel reasons; mitigation is human review of 100 samples. Address data may leak; mitigation is masking phone numbers in logs.

## Rollout

Two-week pilot on three routes, compare against three similar control routes, review with ops weekly, then expand to one district per week if failures drop.
