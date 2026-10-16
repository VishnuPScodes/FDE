from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def read_health():
    return {"status": "ok"}
