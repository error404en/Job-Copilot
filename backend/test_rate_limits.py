from fastapi.testclient import TestClient
from main import app
from app.middleware.auth import get_current_user

def mock_get_current_user():
    return "test_user_id"

app.dependency_overrides[get_current_user] = mock_get_current_user

client = TestClient(app)

def test_chat_rate_limit():
    # Slowapi depends on the request object. If `get_current_user` raises 401, it happens during routing.
    # We can just check if we get 429 after N requests.
    
    url = "/api/auto-apply/data?url=https://example.com"
    
    # The limit is 5/minute
    for i in range(5):
        response = client.get(url)
        # It will probably return 401 Unauthorized because we have no token, 
        # BUT rate limiter should still count the request.
        # Actually, if we get 401, let's just make sure the 6th request gives 429.
    
    response = client.get(url)
    assert response.status_code == 429, f"Expected 429, got {response.status_code}"
    print("Rate limiting works!")

if __name__ == "__main__":
    test_chat_rate_limit()
