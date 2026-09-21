from enum import Enum
from typing import Optional

from pydantic import BaseModel


class ATSSystem(str, Enum):
    GREENHOUSE = "greenhouse"
    LEVER = "lever"
    ASHBY = "ashby"
    SMARTRECRUITERS = "smartrecruiters"
    WORKDAY = "workday"


class ATSInfo(BaseModel):
    system: ATSSystem
    token: str


class CareersDiscoveryResult(BaseModel):
    careers_url: Optional[str] = None
    ats_info: Optional[ATSInfo] = None
