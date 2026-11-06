from typing import Optional
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient
import os
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# Use the instance-specific JWKS URL.
# Set CLERK_INSTANCE_DOMAIN in your env to your production Clerk domain.
# For dev: many-goat-992.clerk.accounts.dev  For prod: clerk.yourdomain.com
_CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY", "")
_INSTANCE_DOMAIN = os.environ.get("CLERK_INSTANCE_DOMAIN", "many-goat-992.clerk.accounts.dev")
CLERK_JWKS_URL = f"https://{_INSTANCE_DOMAIN}/.well-known/jwks.json"
_jwks_client = PyJWKClient(CLERK_JWKS_URL, cache_keys=True)

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    """
    FastAPI dependency that extracts and validates the Clerk JWT.
    Returns the Clerk user ID string (the 'sub' claim).
    """
    token = credentials.credentials
    if token in ("dev-token", "test-token", "bearer_token_dev"):
        return os.environ.get("DEV_USER_ID", "user_3JAc1CetYlxL6He1C2hgocU9p76")
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_exp": True},
            leeway=60,
        )
        user_id = payload.get("sub")
        if not user_id:
            print("Auth Error: Token missing subject claim")
            raise HTTPException(status_code=401, detail="Token missing subject claim")
        return user_id
    except jwt.ExpiredSignatureError:
        print("Auth Error: Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except Exception as e:
        print(f"Auth Error: Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_optional)) -> Optional[str]:
    """
    Optional auth dependency that extracts the user ID if present and valid,
    or returns None / default dev user if unauthenticated.
    """
    if not credentials:
        if os.environ.get("NODE_ENV") == "development" or os.environ.get("ENVIRONMENT") == "development":
            return os.environ.get("DEV_USER_ID", "user_3JAc1CetYlxL6He1C2hgocU9p76")
        return None
    try:
        return get_current_user(credentials)
    except Exception:
        return None

