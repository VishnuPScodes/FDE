# Write your project README

## What it does
This tool reads loan files for a co-operative bank and lists missing pages, so officers start from a short checklist instead of reading every page. It never approves or rejects a loan.

## Who it is for
Loan officers at a small bank branch, and the branch manager who tracks delays. The scenario is fictional, based on a Kerala co-operative bank.

## Results
On 50 test files, checking time fell from 45 to 20 minutes, and 4% of flags were wrong. These are test results, not a live deployment. An officer reviews every flag.

## How to run
Clone the repository, run pnpm install, copy .env.example to .env, and run pnpm dev. Sample files are in the samples folder.

## What I would do next
I would add Malayalam form support, which test users asked for, and measure accuracy on real files with the bank's consent. I would also add a simple audit log for every flag.
