# Full decomposition: citizen petitions

## Goal
Cut routing time from one day to 2 hours and average resolution from 28 to 21 days by 30 June.

## Users
Six intake clerks route petitions. Fourteen department officers resolve them. Citizens want an acknowledgement and a date. The Collector reviews delays every week.

## Data
Scanned paper petitions in Kannada and English, plus email. Three years of routed petitions with department labels sit in a spreadsheet of about 100,000 rows, which I assume is mostly accurate.

## Constraints
Kannada handwriting scans badly. Government data must stay in-state. Any outside vendor needs a tender, so budget is small. Officers distrust automatic routing.

## MVP
Suggest a department for each new typed or scanned petition. The clerk confirms with one click. Measure how often the suggestion matches the final department.

## Architecture
Scan or email goes to text extraction. A classifier trained on the past labels returns a suggested department on the clerk's screen. The clerk confirms and the petition is logged in the existing register.

## Risks
A wrong route delays a citizen, so a clerk confirms every one and we track the mismatch rate. Unreadable handwriting goes to manual routing and is counted, not guessed.

## Rollout
Pilot with two clerks for four weeks on new petitions. If suggestions are right at least 85% of the time and routing falls below 4 hours, extend to all six clerks.

