"""
Issue / Risk Note schemas for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.issue_note import IssueType, IssueSeverity


class IssueNoteBase(BaseModel):
    """Base issue note schema"""
    issue_type: IssueType = IssueType.OTHER
    severity: IssueSeverity = IssueSeverity.MEDIUM
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class IssueNoteCreate(IssueNoteBase):
    """Schema for creating an issue note"""
    work_order_id: int


class IssueNoteUpdate(BaseModel):
    """Schema for updating an issue note"""
    issue_type: Optional[IssueType] = None
    severity: Optional[IssueSeverity] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    is_resolved: Optional[bool] = None
    resolution_notes: Optional[str] = None


class IssueNoteResponse(IssueNoteBase):
    """Schema for issue note response"""
    id: int
    work_order_id: int
    logged_by_id: Optional[int] = None
    is_resolved: bool
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True
