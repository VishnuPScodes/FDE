from fastapi import FastAPI, HTTPException

app = FastAPI()
ITEMS = {7: {"id": 7, "name": "Field Kit"}}

@app.get("/items/{item_id}")
async def read_item(item_id: int):
    if item_id not in ITEMS:
        raise HTTPException(status_code=404, detail="Item not found")
    return ITEMS[item_id]
