# Decomposition checkpoint: a vague school request

## Goal
Raise the pass rate in Class 10 maths from 72% to 80% in the next board exams, measured by the school group results sheet.

## Users
Maths teachers in six schools who need to know which topics students miss, and Class 10 students who need practice. The owner reviews progress each term.

## Data
Unit test marks in Excel per school, in different layouts. Question level marks are probably missing, so we only know totals.

## Constraints
Student data belongs to minors, so parents must be informed and data stays private. Teachers are busy. Many students have only a shared phone. Marathi and English both used.

## MVP
Collect topic wise scores from one Class 10 test in two schools. Show each teacher the three weakest topics. Teachers choose practice sets. No student facing app yet.

## Architecture
Marks sheet -> clean and combine -> topic summary -> one page per teacher. Practice sets are shared as PDFs.

## Risks
Marks may be entered inconsistently, so we agree one template. Teachers may feel watched, so reports are private to each teacher. Pass rate may rise for other reasons, so we compare with the previous year.

## Rollout
Two schools for one term. If teachers use the reports and mock test scores rise by 5 points, extend to all six schools next term.

## Assumptions
I assume the owner means board exam results, not all subjects. I assume tests are given monthly. I assume teachers will share marks in a common sheet if asked.
