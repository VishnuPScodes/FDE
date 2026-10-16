# Incremental loads and legacy feeds

An incremental load processes only records newer than a saved checkpoint. Use a stable ordering key such as `(updated_at, source_id)`, and advance the checkpoint only after the batch is committed. Re-reading an overlapping window is safer than missing late-arriving updates, so the write operation must be idempotent.

## Simulated enterprise interfaces

The `incoming/` directory in these exercises represents an SFTP drop. It is a local fixture, not a network connection. The XML fixture represents a SOAP response body; parse it with Python's standard-library `xml.etree.ElementTree`. The CSV export stands in for a scheduled report from a legacy system.

In a real deployment, SFTP credentials, SOAP authentication, retries, file retention, and ODBC driver compatibility are separate operational concerns. Here, focus on adapting each source to one canonical record shape and reporting partial failures clearly.
