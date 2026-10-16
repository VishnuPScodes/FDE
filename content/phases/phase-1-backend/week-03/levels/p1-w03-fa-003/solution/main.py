from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Product(BaseModel):
    name: str
    price: float

@app.post("/items", status_code=201)
async def create_item(product: Product):
    return {"name": product.name, "price": product.price}
