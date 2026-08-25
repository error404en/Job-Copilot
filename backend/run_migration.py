import os
import sys

# Ensure backend root is in PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.supabase_client import supabase

sql = """
ALTER TABLE user_profile 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS github_url TEXT,
ADD COLUMN IF NOT EXISTS portfolio_url TEXT;
"""

try:
    # We will try to call the postgres REST API if possible, or we will just use supabase rpc.
    # Actually supabase client doesn't support raw SQL over python SDK.
    print("Cannot run raw DDL via python SDK without pg8000 or asyncpg.")
    print("Please run the 03_add_application_data.sql file in the Supabase SQL Editor manually.")
except Exception as e:
    print(e)
