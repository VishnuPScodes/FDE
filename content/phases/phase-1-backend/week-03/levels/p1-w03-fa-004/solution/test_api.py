import pytest
from httpx import ASGITransport, AsyncClient
from main import app

@pytest.mark.asyncio
async def test_default_limit():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 2

@pytest.mark.asyncio
async def test_custom_limit():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items", params={"limit": 3})
    assert [item["id"] for item in response.json()["items"]] == [1, 2, 3]

@pytest.mark.asyncio
async def test_limit_below_one_is_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/items", params={"limit": 0})
    assert response.status_code == 422
