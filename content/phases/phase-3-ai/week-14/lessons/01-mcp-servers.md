---
title: "MCP servers: one plug for many AI apps"
week: 14
module: mcp-servers
---

## What you're about to do

You'll build a small MCP server for a Pune insurer's claims system. It answers the handshake, lists and runs tools, serves documents, offers prompt templates, checks tokens, and reads messages from a pipe.

## The idea

MCP stands for Model Context Protocol. It is a standard way for an AI app to talk to your system. Write the server once. Claude Desktop, an IDE or your own agent can all use it.

The messages are JSON-RPC 2.0. A request has `jsonrpc`, an `id`, a `method` and `params`. The reply has the same `id` and either a `result` or an `error`.

```python
{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
```

A message with no `id` is a notification. You never answer it.

## Three things a server offers

Tools are actions the model can ask for, like `get_claim_status`. Each has a name, a description and an `inputSchema`. Validate the arguments before you run anything.

Resources are things to read, like the policy wording. They have a URI such as `policy://motor/standard-wording`. The list shows names only. A `resources/read` returns the text.

Prompts are templates a person picks, like "Summarise a claim". Fill them with `str.format`. Argument values are user input. Put them in as values, never as part of the template.

## Two kinds of failure

A protocol error means the request itself was wrong: unknown method (`-32601`), bad params (`-32602`). Return an `error`.

A tool that ran and failed is different. Return a normal `result` with `"isError": true` and the message. The model can then read it and try again.

## Scopes

Not every client should do everything. A WhatsApp bot may read claims. Only an officer's assistant may approve them. Give each token a set of scopes, like `claims:read`.

Hiding a tool from `tools/list` is not enough. A client can send a call for a tool it never saw. Check the scope again on `tools/call`, before the tool runs.

## Transport

Over stdio, each message is one line of JSON. Read a line, parse it, call `handle`, write one line back. Bad JSON gets error `-32700` with id `null`. A notification writes nothing.

## Common mistakes

Answering a notification. Strict clients will break.

Sending `fn` (a Python function) in the tools list. It cannot be turned into JSON.

Checking scopes only in the list.

## On the job

When a client says "connect it to our CRM", an MCP server is often the cleanest answer. Start with read-only tools. Add write tools later, behind a scope and an approval step.
