"""
Field Log schemas for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class FieldLogBase(BaseModel):
    """Base field log schema"""
    work_done_summary: str = Field(..., min_length=1)
    notes: Optional[str] = None
    materials_used: Optional[str] = None   # JSON string
    labor_hours: Optional[float] = Field(None, ge=0, le=24)
    photos: Optional[str] = None           # JSON string


class FieldLogCreate(FieldLogBase):
    """Schema for creating a field log"""
    work_order_id: int


class FieldLogUpdate(BaseModel):
    """Schema for updating a field log"""
    work_done_summary: Optional[str] = Field(None, min_length=1)
    notes: Optional[str] = None
    materials_used: Optional[str] = None
    labor_hours: Optional[float] = Field(None, ge=0, le=24)
    photos: Optional[str] = None


class FieldLogResponse(FieldLogBase):
    """Schema for field log response"""
    id: int
    work_order_id: int
    logged_by_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
