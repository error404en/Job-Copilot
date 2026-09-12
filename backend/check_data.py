from app.db.supabase_client import supabase
from dotenv import load_dotenv
import os
load_dotenv(".env")

CLERK_USER_ID = "user_3JAc1CetYlxL6He1C2hgocU9p76"

TABLES = [
    "user_profile",
    "resume_versions",
    "jobs",
    "job_analyses",
    "application_drafts",
    "applications",
    "ats_subscriptions",
]

print(f"Assigning all NULL user_id rows to Clerk user: {CLERK_USER_ID}\n")

for table in TABLES:
    try:
        res = supabase.table(table).update({"user_id": CLERK_USER_ID}).is_("user_id", "null").execute()
        count = len(res.data) if res.data else 0
        print(f"  {table}: updated {count} rows")
    except Exception as e:
        print(f"  {table}: error - {e}")

print("\nDone! All your data is now linked to your Clerk account.")
