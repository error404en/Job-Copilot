from pydantic import BaseModel, Field
from typing import List, Optional

class ParsedJob(BaseModel):
    company: str = Field(description="Name of the company hiring")
    role_title: str = Field(description="The job title")
    location: Optional[str] = Field(default=None, description="Geographic location of the job (city, state, country), if mentioned. Null if completely unspecified.")
    remote_type: str = Field(default="unclear", description="'remote', 'hybrid', 'onsite', or 'unclear'")
    pay_min: Optional[int] = Field(default=None, description="Minimum annual pay (in INR). Extract if stated. If in USD/other, convert roughly to INR or leave null.")
    pay_max: Optional[int] = Field(default=None, description="Maximum annual pay (in INR).")
    pay_currency: str = Field(default="INR", description="Currency of the pay")
    pay_confidence: str = Field(default="estimated", description="'stated' if explicitly in JD, 'estimated' if inferred, 'unknown' if no clues")
    seniority_required: str = Field(default="0-2yr", description="'fresher', '0-2yr', '2-5yr', 'senior', or 'unclear'")
    required_skills: List[str] = Field(default_factory=list, description="List of mandatory technical or soft skills")
    nice_to_have_skills: List[str] = Field(default_factory=list, description="List of preferred or bonus skills")
    apply_link: Optional[str] = Field(default=None, description="The direct apply URL if present in the text, otherwise guess the company's official career page URL.")

class FitReport(BaseModel):
    match_score: int = Field(description="0-100 score evaluating how well the resume matches the JD")
    matched_keywords: List[str] = Field(description="Skills/keywords present in both resume and JD")
    missing_keywords: List[str] = Field(description="Required JD skills missing from the resume")
    pay_floor_pass: bool = Field(description="True if pay meets user floor, False otherwise")
    relocation_required: bool = Field(description="True if user must relocate, False if remote or in user's base location")
    seniority_fit: str = Field(description="'good_fit', 'stretch', 'overqualified', or 'underqualified'")
    goal_alignment_note: str = Field(description="A short sentence on how this aligns with the user's career goals")
    verdict: str = Field(description="'apply', 'stretch', or 'skip'")
    reasoning: str = Field(description="A 2-3 sentence explanation of the verdict")
    culture_assessment: str = Field(description="A 1-2 sentence estimate of the work-life balance, culture, and career growth at this company (act as a Glassdoor equivalent). If completely unknown, say 'Startup/Unknown culture'.")
