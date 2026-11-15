from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class UserIn(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str

@app.post("/users", response_model=UserOut, status_code=201)
async def create_user(user: UserIn):
    return {"id": 1, "email": user.email, "password": user.password}
