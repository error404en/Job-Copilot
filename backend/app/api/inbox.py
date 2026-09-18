from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from app.middleware.auth import get_current_user
from app.models.inbox import UploadInboxRequest, SourceType, InboxSourceStatus
from app.services.inbox_processor import process_inbox_source
from app.db.supabase_client import supabase
import uuid
import os

router = APIRouter()

@router.post("/text")
async def upload_inbox_text(req: UploadInboxRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    source_id = str(uuid.uuid4())
    record = {
        "id": source_id,
        "user_id": user_id,
        "source_type": req.source_type.value,
        "raw_content": req.content,
        "status": InboxSourceStatus.PROCESSING.value
    }
    
    supabase.table("inbox_sources").insert(record).execute()
    
    # Process in background
    background_tasks.add_task(process_inbox_source, source_id, req.content, req.source_type, user_id)
    
    return {"status": "processing", "source_id": source_id}

@router.post("/upload")
async def upload_inbox_file(background_tasks: BackgroundTasks, file: UploadFile = File(...), source_type: str = Form(...), user_id: str = Depends(get_current_user)):
    source_id = str(uuid.uuid4())
    
    # Save file temporarily
    file_ext = os.path.splitext(file.filename)[1]
    file_path = f"/tmp/{source_id}{file_ext}"
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    try:
        s_type = SourceType(source_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid source type")

    record = {
        "id": source_id,
        "user_id": user_id,
        "source_type": s_type.value,
        "raw_content": file_path, # We store path for backend processing
        "status": InboxSourceStatus.PROCESSING.value
    }
    
    supabase.table("inbox_sources").insert(record).execute()
    
    # Process in background
    background_tasks.add_task(process_inbox_source, source_id, file_path, s_type, user_id)
    
    return {"status": "processing", "source_id": source_id}

@router.get("/opportunities")
def list_opportunities(user_id: str = Depends(get_current_user)):
    res = supabase.table("inbox_opportunities").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"opportunities": res.data}
