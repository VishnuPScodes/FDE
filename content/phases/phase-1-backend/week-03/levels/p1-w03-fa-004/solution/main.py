from fastapi import FastAPI, Query

app = FastAPI()
ITEMS = [
    {"id": 1, "name": "Field Kit"},
    {"id": 2, "name": "Sensor"},
    {"id": 3, "name": "Gateway"},
]

@app.get("/items")
async def list_items(limit: int = Query(2, ge=1)):
    return {"items": ITEMS[:limit]}
