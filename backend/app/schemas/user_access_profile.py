"""
User access profile schemas.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserAccessProfileBase(BaseModel):
    user_id: int
    department: str = Field(..., min_length=1, max_length=120)
    cost_center: Optional[str] = None
    notes: Optional[str] = None


class UserAccessProfileUpdate(BaseModel):
    department: Optional[str] = Field(None, min_length=1, max_length=120)
    cost_center: Optional[str] = None
    notes: Optional[str] = None


class UserAccessProfileResponse(UserAccessProfileBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True