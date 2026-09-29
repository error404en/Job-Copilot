import httpx
from supabase import create_client, Client, ClientOptions
from app.config.settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Using service role key for backend operations.
# Using HTTP/1.1 with bounded keepalive to prevent RemoteProtocolError / idle connection severing
_httpx_client = httpx.Client(
    http2=False,
    timeout=30.0,
    limits=httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=20.0)
)

supabase: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_SERVICE_ROLE_KEY,
    options=ClientOptions(httpx_client=_httpx_client)
)
