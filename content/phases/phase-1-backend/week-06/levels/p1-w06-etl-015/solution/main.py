import csv
from io import StringIO
import xml.etree.ElementTree as ET

def _csv_rows(text, source):
    return [{**row, "source": source} for row in csv.DictReader(StringIO(text.lstrip("\ufeff")))]

def _soap_rows(text):
    root = ET.fromstring(text)
    rows = []
    for customer in root.iter():
        if customer.tag.split("}")[-1] == "Customer":
            fields = {child.tag.split("}")[-1]: child.text or "" for child in customer}
            rows.append({"gstin": fields.get("GSTIN", ""), "name": fields.get("Name", ""), "updated_at": fields.get("UpdatedAt", ""), "source": "soap"})
    return rows

def run_etl(csv_text, soap_xml, sftp_csv_text):
    rows = _csv_rows(csv_text, "csv") + _soap_rows(soap_xml) + _csv_rows(sftp_csv_text, "sftp")
    winners, quarantine = {}, []
    for row in rows:
        gstin = row.get("gstin", "").strip().upper()
        name = row.get("name", "").strip()
        updated_at = row.get("updated_at", "").strip()
        reason = "gstin is required" if not gstin else "name is required" if not name else "updated_at is required" if not updated_at else None
        if reason:
            quarantine.append({"row": row, "reason": reason})
            continue
        record = {"gstin": gstin, "name": name, "updated_at": updated_at, "source": row["source"]}
        previous = winners.get(gstin)
        if previous is None or (updated_at, row["source"]) > (previous["updated_at"], previous["source"]):
            winners[gstin] = record
    records = [winners[key] for key in sorted(winners)]
    checkpoint = max((record["updated_at"] for record in records), default=None)
    return {"records": records, "quarantine": quarantine, "counts": {"read": len(rows), "accepted": len(records), "duplicates": len(rows) - len(records) - len(quarantine), "rejected": len(quarantine)}, "checkpoint": checkpoint}
