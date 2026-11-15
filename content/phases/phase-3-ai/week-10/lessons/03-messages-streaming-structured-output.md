# Messages, streaming and structured output

In the next levels you will build a clean messages list, assemble a streamed reply and streamed tool calls, and make a JSON extractor that retries when the model slips.

## The messages list

Chat APIs take a list of turns. Each turn has a `role` (`system`, `user` or `assistant`) and `content`. The system turn sets the rules. User and assistant turns alternate. Empty turns and two user turns in a row cause confusing errors, so clean the list before you send it.

## Streaming

With `"stream": true`, the reply arrives in small pieces as Server-Sent Events. Each event is a line that starts with `data:` and holds a small JSON chunk. The stream ends with `data: [DONE]`. You join the pieces as they arrive, so the user sees text within a second instead of waiting for the whole answer.

```text
data: {"choices":[{"delta":{"content":"Your refund of "}}]}
data: {"choices":[{"delta":{"content":"₹1,499 is on the way."}}]}
data: [DONE]
```

Tool calls stream the same way. The JSON arguments arrive as pieces of text under `delta.tool_calls`, and each piece has an `index` that says which call it belongs to. The first piece for an index carries the call `id` and tool name. When the model calls two tools at once, their pieces can arrive mixed together. Group the pieces by `index`, join the text, and parse the JSON only once the stream has finished.

## Structured output

When you extract fields from an invoice, you want JSON that matches a schema every time. Many providers offer a JSON mode or a schema option. Still validate the reply in your own code. If it is broken, call again and tell the model what was wrong. Stop after a few tries and send the case to a human.

```python
reply = '{"invoice_number": "INV-118", "gstin": "SHORT", "total_inr": 11800}'
validate(json.loads(reply))   # 'gstin must be a 15 character string'
```

## Common mistakes

Calling `json.loads("[DONE]")` raises `json.decoder.JSONDecodeError: Expecting value`. Check for the end marker first.

Trusting JSON mode blindly. Valid JSON can still miss a field or put a number in quotes.

In Python, `isinstance(True, int)` is `True`. A total of `true` will pass a lazy number check.

## On the job

Downstream systems such as Tally or a bank's core system break on bad data. Validation plus a bounded retry is what turns a demo into something a customer can run every night.
