import pytest
from httpx import ASGITransport, AsyncClient
from main import app

@pytest.mark.asyncio
async def test_create_product():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/items", json={"name": "Sensor", "price": 19.5})
    assert response.status_code == 201
    assert response.json() == {"name": "Sensor", "price": 19.5}

@pytest.mark.asyncio
async def test_invalid_price_is_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/items", json={"name": "Sensor", "price": "unknown"})
    assert response.status_code == 422
