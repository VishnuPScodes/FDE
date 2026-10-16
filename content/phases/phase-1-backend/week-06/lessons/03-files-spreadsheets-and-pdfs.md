# Excel and PDF ingestion

Excel workbooks and PDFs are containers, not reliable database formats. Select the worksheet intentionally, identify its header row, and validate each cell just as you would a CSV field. For PDFs, extract text and expect layout-dependent gaps; extraction is not OCR and does not guarantee table structure.

This workspace installs `openpyxl` and `pypdf` on first use when your code imports them. The packages run in Pyodide in your browser; no file is uploaded to a server. Use `openpyxl.load_workbook(..., read_only=True, data_only=True)` for tabular workbook data and `pypdf.PdfReader` for text-based PDFs.

```python
from io import BytesIO
from openpyxl import load_workbook

workbook = load_workbook(BytesIO(file_bytes), read_only=True, data_only=True)
sheet = workbook[workbook.sheetnames[0]]
```

Never treat a missing extracted value as proof that the source document contained no value. Capture the source filename and route ambiguous documents to a human review queue.
