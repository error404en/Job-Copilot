from supabase import create_client, Client
from app.config.settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Using service role key for backend operations since it's a single-user local tool.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
