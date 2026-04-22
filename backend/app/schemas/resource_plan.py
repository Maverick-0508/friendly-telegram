"""
Resource Plan schemas for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ResourcePlanBase(BaseModel):
    """Base resource plan schema"""
    crew_count: int = Field(1, ge=1, le=100)
    crew_names: Optional[str] = None         # JSON string
    equipment_list: Optional[str] = None     # JSON string
    estimated_labor_hours: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class ResourcePlanCreate(ResourcePlanBase):
    """Schema for creating a resource plan"""
    work_order_id: int


class ResourcePlanUpdate(BaseModel):
    """Schema for updating a resource plan"""
    crew_count: Optional[int] = Field(None, ge=1, le=100)
    crew_names: Optional[str] = None
    equipment_list: Optional[str] = None
    estimated_labor_hours: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class ResourcePlanResponse(ResourcePlanBase):
    """Schema for resource plan response"""
    id: int
    work_order_id: int
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
