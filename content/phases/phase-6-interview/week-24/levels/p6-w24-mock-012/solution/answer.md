# Mock: a STAR answer about shipping under pressure

## Situation
Two days before a demo for a Nagpur logistics customer, my invoice reader still failed on a third of the sample PDFs, and the customer's director was flying in to see it launch.

## Task
I owned the demo and needed a working version of the reader that the director could trust, with only two days left.

## Action
I asked the customer which three invoice formats covered most of their volume and proposed that we support only those. I showed my manager the failure list, agreed to cut the report page and the email export, and wrote down what was deferred. I rewrote the parser for the three formats, tested it on 60 real samples, and added a clear "needs human review" flag for anything else. I rehearsed the demo twice and prepared a fallback video in case the network failed. I also told the director in advance that the tool handled three formats and what the plan was for the rest.

## Result
The demo ran without errors, the reader handled 94% of sample invoices on the day, and the customer signed a pilot worth ₹6 lakh. I learned to cut scope openly instead of hoping everything will work.
