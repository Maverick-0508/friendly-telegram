"""
Service schemas for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ServiceBase(BaseModel):
    """Base service schema"""
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    description: str
    short_description: Optional[str] = None
    base_price: float = Field(..., ge=0)
    price_unit: str = "per service"
    features: Optional[List[str]] = None
    icon: Optional[str] = None
    is_active: bool = True
    display_order: int = 0


class ServiceCreate(ServiceBase):
    """Schema for creating a service"""
    pass


class ServiceUpdate(BaseModel):
    """Schema for updating a service"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = None
    base_price: Optional[float] = Field(None, ge=0)
    price_unit: Optional[str] = None
    features: Optional[List[str]] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class ServiceResponse(ServiceBase):
    """Schema for service response"""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
