import pytest
from httpx import ASGITransport, AsyncClient
from main import app

@pytest.mark.asyncio
async def test_existing_item():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items/7")
    assert response.status_code == 200
    assert response.json() == {"id": 7, "name": "Field Kit"}

@pytest.mark.asyncio
async def test_unknown_item():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items/99")
    assert response.status_code == 404
