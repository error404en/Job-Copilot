import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.db.supabase_client import supabase
from clerk_backend_api import Clerk

clerk_client = Clerk(bearer_auth=os.environ.get("CLERK_SECRET_KEY"))

TABLES = [
    "user_profile",
    "resume_versions",
    "jobs",
    "job_analyses",
    "application_drafts",
    "applications",
    "ats_subscriptions",
]

def get_clerk_user_id():
    """Get the single Clerk user's ID."""
    response = clerk_client.users.list()
    users = response if isinstance(response, list) else getattr(response, 'data', [])
    if not users:
        print("No users found in Clerk. Please sign up first.")
        return None
    user = users[0]
    email = user.email_addresses[0].email_address if user.email_addresses else "?"
    print(f"Found Clerk user: {email} (ID: {user.id})")
    return user.id

def find_old_user_ids():
    """Scan data tables to find all existing user_ids (old Supabase UUIDs)."""
    old_ids = set()
    for table in TABLES:
        try:
            res = supabase.table(table).select("user_id").execute()
            for row in (res.data or []):
                uid = row.get("user_id")
                if uid:
                    old_ids.add(uid)
        except Exception as e:
            print(f"  Warning: could not scan {table}: {e}")
    return old_ids

def migrate_data():
    print("Step 1: Getting Clerk user...")
    new_id = get_clerk_user_id()
    if not new_id:
        return

    print("\nStep 2: Scanning data tables for existing user IDs...")
    old_ids = find_old_user_ids()

    if not old_ids:
        print("No existing data found in any table — nothing to migrate.")
        return

    # Filter out any IDs that are already the new Clerk ID
    old_ids = {uid for uid in old_ids if uid != new_id}

    if not old_ids:
        print("All data already points to the new Clerk user ID. Nothing to do!")
        return

    print(f"Found old user IDs: {old_ids}")

    print(f"\nStep 3: Remapping all rows to Clerk ID: {new_id}")
    for old_id in old_ids:
        print(f"\n  Migrating from old ID: {old_id}")
        for table in TABLES:
            try:
                res = supabase.table(table).update({"user_id": new_id}).eq("user_id", old_id).execute()
                count = len(res.data) if res.data else 0
                if count > 0:
                    print(f"    ✓ {table}: updated {count} rows")
            except Exception as e:
                print(f"    ✗ {table}: {e}")

    print("\nMigration complete! Your old data is now linked to your Clerk account.")

if __name__ == "__main__":
    migrate_data()
