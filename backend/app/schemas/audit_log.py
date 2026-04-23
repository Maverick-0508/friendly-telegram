"""
Audit log schemas.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    actor_user_id: Optional[int] = None
    actor_email: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    summary: Optional[str] = None
    details_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True