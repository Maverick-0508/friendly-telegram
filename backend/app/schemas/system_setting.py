"""
System setting schemas.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SystemSettingBase(BaseModel):
    setting_key: str = Field(..., min_length=1, max_length=120)
    label: str = Field(..., min_length=1, max_length=120)
    group_name: str = Field(..., min_length=1, max_length=120)
    value: str = ""
    description: Optional[str] = None
    is_sensitive: bool = False


class SystemSettingUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=120)
    group_name: Optional[str] = Field(None, min_length=1, max_length=120)
    value: Optional[str] = None
    description: Optional[str] = None
    is_sensitive: Optional[bool] = None


class SystemSettingResponse(SystemSettingBase):
    id: int
    updated_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True