# LLM as judge and regression gates

In the next levels you will write a judge prompt, run a judge with retries, measure how well it agrees with humans, fix position bias, and block bad changes in CI. You never need an API key. A fake judge function stands in for the model.

## When you need a judge

For open answers there is no exact string to compare. "Your refund arrives by the next working day" and "Expect the money in T+1 days" mean the same. A second model can grade the answer against a rubric. This is LLM-as-judge.

## A good rubric

Keep it short and checkable. Three to five items.

- Mentions the T+1 working day rule.
- Does not promise anything the context does not say.
- Polite and under 80 words.

Ask for a fixed reply format: `SCORE: 4` then `REASON: ...`. Then parse it with a regex. Judges sometimes break the format, so retry once and report the ones that still fail. Never turn a failed parse into a zero.

## Can you trust the judge?

Not until you check. Have a human grade 50 answers, run the judge on the same 50, and compare.

Raw agreement lies. If 90 percent of answers are "pass", a lazy judge that always says "pass" agrees 90 percent of the time. Cohen's kappa subtracts the agreement you would get by luck. 0 means no better than chance. Above 0.6 is usually good enough to use.

## Known biases

Position bias: when comparing two answers, the judge likes the first one. Fix it by asking twice with the order swapped. If the verdict flips, call it a tie.

Length bias: longer answers get higher scores. Add "do not reward length" to the rubric and check by comparing scores against word counts.

Self-preference: a model rates its own style higher. Use a different model as judge when you can.

## Regression gates

An eval that nobody runs does not protect you. Put it in CI:

1. Save the metrics of the current main branch as a baseline file.
2. On every pull request, run the evals and compare.
3. If any metric drops more than a small tolerance (say 0.02), exit with code 1. The build fails.
4. Add hard floors too, for example recall@3 must never go below 0.80.

Floats are tricky: `0.82 - 0.80` is not exactly `0.02`. Round the drop before you compare.

## On the job

A Hyderabad bank team ships prompt changes every week. The gate means nobody has to remember to check quality. A red build with "recall: 0.82 -> 0.74" ends the argument.
