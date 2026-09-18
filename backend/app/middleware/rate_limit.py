from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from fastapi import Request

def get_user_id_or_ip(request: Request) -> str:
    """
    Returns the authenticated user_id if present, otherwise falls back to IP address.
    Because our authentication happens in dependency injection (Depends(get_current_user)),
    the raw request object might not have user_id parsed yet for global middleware.
    However, if an endpoint depends on get_current_user, we can extract it from the Auth header.
    For simplicity and robustness in slowapi, we'll try to extract the user ID from the Authorization header manually,
    or just fall back to IP if missing.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        # In a real app we might decode the JWT here to get the exact user_id.
        # To avoid overhead on every request, we can just hash the token as a unique identifier for the user.
        import hashlib
        return hashlib.sha256(token.encode()).hexdigest()
        
    # Fallback to IP address for unauthenticated routes or if no token is provided
    return get_remote_address(request)

# Create a global limiter instance
# We use in-memory storage by default. 
# For production, this should be configured with a Redis backend via `storage_uri="redis://..."`
limiter = Limiter(key_func=get_user_id_or_ip)
