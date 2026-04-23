"""
Permission policy schemas.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PermissionPolicyBase(BaseModel):
    feature_key: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    allowed_roles: str = Field(default="admin,supervisor")
    allowed_departments: str = Field(default="")
    is_enabled: bool = True


class PermissionPolicyUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    allowed_roles: Optional[str] = None
    allowed_departments: Optional[str] = None
    is_enabled: Optional[bool] = None


class PermissionPolicyResponse(PermissionPolicyBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True