from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient
import os
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()

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

