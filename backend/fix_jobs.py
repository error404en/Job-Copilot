import re

with open("app/api/jobs.py", "r", encoding="utf-8") as f:
    content = f.read()

# Imports
content = content.replace(
    "from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File",
    "from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Depends"
)
content = content.replace(
    "from app.services.company_researcher import research_company",
    "from app.services.company_researcher import research_company\nfrom app.middleware.auth import get_current_user"
)

# get_jobs
content = content.replace(
    "def get_jobs():",
    "def get_jobs(user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    ".select(\"*, job_analyses(*)\") \\\n        .order",
    ".select(\"*, job_analyses(*)\") \\\n        .eq(\"user_id\", user_id) \\\n        .order"
)

# get_digest
content = content.replace(
    "def get_digest():",
    "def get_digest(user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    ".select(\"*, job_analyses(*)\") \\\n        .gte",
    ".select(\"*, job_analyses(*)\") \\\n        .eq(\"user_id\", user_id) \\\n        .gte"
)

# scrape_job_url
content = content.replace(
    "def scrape_job_url(url: str):",
    "def scrape_job_url(url: str, user_id: str = Depends(get_current_user)):"
)

# get_job
content = content.replace(
    "def get_job(id: str):",
    "def get_job(id: str, user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    ".eq(\"id\", id).execute()",
    ".eq(\"id\", id).eq(\"user_id\", user_id).execute()"
)

# parse_and_score_job
content = content.replace(
    "def parse_and_score_job(req: ParseRequest):",
    "def parse_and_score_job(req: ParseRequest, user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    ".eq(\"url\", target_url).limit(1).execute()",
    ".eq(\"url\", target_url).eq(\"user_id\", user_id).limit(1).execute()"
)
content = content.replace(
    ".eq(\"id\", job_record[\"id\"]).execute()",
    ".eq(\"id\", job_record[\"id\"]).eq(\"user_id\", user_id).execute()"
)
content = content.replace(
    "supabase.table(\"user_profile\").select(\"*\").limit(1).execute()",
    "supabase.table(\"user_profile\").select(\"*\").eq(\"user_id\", user_id).limit(1).execute()"
)
content = content.replace(
    "supabase.table(\"resume_versions\").select(\"*\").execute()",
    "supabase.table(\"resume_versions\").select(\"*\").eq(\"user_id\", user_id).execute()"
)
content = content.replace(
    "\"nice_to_have_skills\": parsed_job.nice_to_have_skills",
    "\"nice_to_have_skills\": parsed_job.nice_to_have_skills,\n        \"user_id\": user_id"
)
content = content.replace(
    ".eq(\"url\", resolved_url).limit(1).execute()",
    ".eq(\"url\", resolved_url).eq(\"user_id\", user_id).limit(1).execute()"
)
content = content.replace(
    ".eq(\"company\", parsed_job.company).execute()",
    ".eq(\"company\", parsed_job.company).eq(\"user_id\", user_id).execute()"
)
content = content.replace(
    "\"company_info\": company_info",
    "\"company_info\": company_info,\n        \"user_id\": user_id"
)

# parse_and_score_image
content = content.replace(
    "async def parse_and_score_image(file: UploadFile = File(...)):",
    "async def parse_and_score_image(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    "return parse_and_score_job(req)",
    "return parse_and_score_job(req, user_id)"
)

# get_subscriptions
content = content.replace(
    "def get_subscriptions():",
    "def get_subscriptions(user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    ".select(\"*\").order(\"created_at\", desc=True).execute()",
    ".select(\"*\").eq(\"user_id\", user_id).order(\"created_at\", desc=True).execute()"
)

# delete_subscription
content = content.replace(
    "def delete_subscription(sub_id: str):",
    "def delete_subscription(sub_id: str, user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    "delete().eq(\"id\", sub_id).execute()",
    "delete().eq(\"id\", sub_id).eq(\"user_id\", user_id).execute()"
)

# fetch_and_analyze_ats
content = content.replace(
    "def fetch_and_analyze_ats(req: FetchAtsRequest, background_tasks: BackgroundTasks):",
    "def fetch_and_analyze_ats(req: FetchAtsRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    "req.target_keywords else \"\"",
    "req.target_keywords else \"\",\n                \"user_id\": user_id"
)
content = content.replace(
    "def process_jobs():",
    "def process_jobs(user_id: str = user_id):"
)
content = content.replace(
    "background_tasks.add_task(process_jobs)",
    "background_tasks.add_task(process_jobs)" # Actually passing user_id using default arg is safer if needed, wait, background tasks takes args: background_tasks.add_task(process_jobs)
)
content = content.replace(
    "parse_and_score_job(parse_req)",
    "parse_and_score_job(parse_req, user_id)"
)

# create_application_draft
content = content.replace(
    "def create_application_draft(job_id: str, req: DraftRequest):",
    "def create_application_draft(job_id: str, req: DraftRequest, user_id: str = Depends(get_current_user)):"
)
content = content.replace(
    ".eq(\"id\", job_id).execute()",
    ".eq(\"id\", job_id).eq(\"user_id\", user_id).execute()"
)
# Note: resumes_resp uses same code above, need to make sure we don't double replace
content = content.replace(
    "\"cover_letter_text\": letter",
    "\"cover_letter_text\": letter,\n        \"user_id\": user_id"
)

# update_job
content = content.replace(
    "def update_job(job_id: str, req: JobUpdateRequest):",
    "def update_job(job_id: str, req: JobUpdateRequest, user_id: str = Depends(get_current_user)):"
)

# delete_job
content = content.replace(
    "def delete_job(job_id: str):",
    "def delete_job(job_id: str, user_id: str = Depends(get_current_user)):"
)

# toggle_bookmark
content = content.replace(
    "def toggle_bookmark(job_id: str, req: BookmarkRequest):",
    "def toggle_bookmark(job_id: str, req: BookmarkRequest, user_id: str = Depends(get_current_user)):"
)

with open("app/api/jobs.py", "w", encoding="utf-8") as f:
    f.write(content)
