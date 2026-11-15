from html.parser import HTMLParser

SKIP = {"script", "style", "nav", "footer"}
HEADINGS = {"h1", "h2", "h3"}
BLOCKS = HEADINGS | {"p", "li"}


class BlockParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.skip_depth = 0
        self.current = None
        self.current_tag = None

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip_depth += 1
        elif tag in BLOCKS and self.skip_depth == 0:
            self.current = []
            self.current_tag = tag

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip_depth = max(0, self.skip_depth - 1)
        elif tag == self.current_tag and self.current is not None:
            text = " ".join("".join(self.current).split())
            if text:
                self.blocks.append(("# " + text) if tag in HEADINGS else text)
            self.current = None
            self.current_tag = None

    def handle_data(self, data):
        if self.skip_depth == 0 and self.current is not None:
            self.current.append(data)


def html_to_blocks(html_text):
    parser = BlockParser()
    parser.feed(html_text)
    parser.close()
    return parser.blocks
