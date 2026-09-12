import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import jobs, profile, auto_apply, resumes, research
from app.services.scheduler import start_scheduler
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield

app = FastAPI(title="JobCopilot API", version="1.0.0", lifespan=lifespan)

# CORS: set ALLOWED_ORIGINS env var in production (comma-separated).
# Example: ALLOWED_ORIGINS=https://myapp.vercel.app,https://www.myapp.com
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(auto_apply.router, prefix="/api/auto-apply", tags=["Auto-Apply"])
app.include_router(resumes.router, prefix="/api/resumes", tags=["Resumes"])
app.include_router(research.router, prefix="/api/research", tags=["Research"])

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
