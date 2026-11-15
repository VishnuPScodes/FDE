---
title: "Parsing and chunking: get clean text into small pieces"
week: 11
module: document-parsing
---

## What you're about to do

You'll clean text pulled out of a PDF, read an HTML page, turn a table into rows, and cut a long document into overlapping chunks. Four small functions. Every RAG system starts here.

## The idea

RAG means retrieval-augmented generation. The model answers from documents you find for it. If the documents are messy, the search is messy, and the answer is wrong.

A bank's PDF circular arrives with page markers like `Page 3 of 12` in the middle of sentences. Words are split across lines: `un-` then `authorised`. Clean that first. Remove page lines. Join the split words. Keep real hyphens, as in `co-operative`.

```python
text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
```

Fix the hyphen break only when a hyphen sits right before a line break. Then a single line break inside a paragraph becomes a space, and a blank line stays a paragraph break.

## HTML and tables

An insurer's help page is HTML. You want what a reader sees, not menus, scripts or footers. Python's `HTMLParser` walks the tags for you. Keep a counter for "am I inside a script or nav right now?" and ignore text while it is above zero.

A table often arrives as text with `|` between cells. Turn each row into a small record, then into one sentence: `hsn_code: 0401; description: Fresh milk; gst_rate: 0%`. A row cut loose from its header is useless. A row with its labels can be found by search.

## Chunking

You cannot send a whole 80-page circular to the model for every question. You cut it into chunks and retrieve only the best few.

Chunks need overlap. Say a rule starts at the end of one chunk and finishes in the next. With no overlap, neither chunk holds the full rule. With an overlap of a few words, the rule appears whole in at least one.

```python
step = size - overlap
```

Move forward by `step` words each time. Stop when a chunk reaches the last word. Otherwise you emit a last chunk made only of repeated words.

Give every chunk an id like `faq#2`. You will need it later for citations.

## Common mistakes

Chunking before cleaning. The page markers end up inside your chunks.

Overlap bigger than or equal to size. The window never moves forward. Raise an error.

Using characters when the text mixes English and Hindi. Words are a safer unit for a first version.

## On the job

Most RAG bugs in a client project are parsing bugs. Before you tune anything, print ten chunks and read them. If a chunk is hard for you to read, it is hard for the model too.
