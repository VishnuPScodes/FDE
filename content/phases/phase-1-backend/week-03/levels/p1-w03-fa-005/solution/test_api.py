import pytest
from httpx import ASGITransport, AsyncClient
from main import app

@pytest.mark.asyncio
async def test_create_user_hides_password():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/users", json={"email": "a@example.com", "password": "s3cret"})
    assert response.status_code == 201
    assert response.json() == {"id": 1, "email": "a@example.com"}

@pytest.mark.asyncio
async def test_missing_password_is_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/users", json={"email": "a@example.com"})
    assert response.status_code == 422
