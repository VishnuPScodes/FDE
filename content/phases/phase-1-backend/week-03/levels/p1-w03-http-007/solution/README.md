# Reference approach

Send `GET /api/items/101` and read the `200` item. Then send `GET /api/items/999` and read the `404` with `Item not found`. A missing resource is reported with 404, not retried.
