from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
import uuid

class SourceType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    CSV = "csv"
    URL = "url"

class InboxSourceStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class InboxOpportunityStatus(str, Enum):
    PENDING = "pending"
    FOUND = "found"
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    NOT_FOUND = "not_found"
    EXPIRED = "expired"
    DUPLICATE = "duplicate"
    INELIGIBLE = "ineligible"
    RELEVANT = "relevant"

class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    UNVERIFIED_THIRD_PARTY = "unverified_third_party"
    PROMO_FUNNEL = "promo_funnel"

class ExtractionMetadata(BaseModel):
    experience_req: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    salary: Optional[str] = None
    deadline: Optional[str] = None
    work_mode: Optional[str] = None

class InboxSource(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    source_type: SourceType
    raw_content: str
    status: InboxSourceStatus = InboxSourceStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)

class InboxOpportunity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    source_id: str
    company: Optional[str] = None
    role_title: Optional[str] = None
    location: Optional[str] = None
    original_submitted_url: Optional[str] = None
    verified_official_url: Optional[str] = None
    status: InboxOpportunityStatus = InboxOpportunityStatus.PENDING
    verification_status: Optional[VerificationStatus] = None
    job_id: Optional[str] = None
    extraction_metadata: ExtractionMetadata = Field(default_factory=ExtractionMetadata)
    relevance_explanation: Optional[str] = None
    missing_requirements: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UploadInboxRequest(BaseModel):
    content: str
    source_type: SourceType
