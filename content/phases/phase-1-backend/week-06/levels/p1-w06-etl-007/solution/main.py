from io import BytesIO
from pypdf import PdfReader

def extract_pages(data):
    reader = PdfReader(BytesIO(data))
    return [(page.extract_text() or "").strip() for page in reader.pages]
