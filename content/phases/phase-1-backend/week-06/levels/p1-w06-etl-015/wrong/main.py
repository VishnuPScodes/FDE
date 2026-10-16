def run_etl(csv_text, soap_xml, sftp_csv_text):
    return {"records": [], "quarantine": [], "counts": {"read": 0, "accepted": 0, "duplicates": 0, "rejected": 0}}
