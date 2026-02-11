"""
Quote schemas for API requests and responses
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from app.models.quote import QuoteStatus


class QuoteBase(BaseModel):
    """Base quote schema"""
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=1, max_length=20)
    address: str = Field(..., min_length=1, max_length=500)
    property_size: Optional[float] = Field(None, ge=0)
    property_type: Optional[str] = None
    service_type: str = Field(..., min_length=1, max_length=200)
    service_frequency: Optional[str] = None
    preferred_start_date: Optional[datetime] = None
    additional_details: Optional[str] = None


class QuoteCreate(QuoteBase):
    """Schema for creating a quote request"""
    pass


class QuoteUpdate(BaseModel):
    """Schema for updating a quote"""
    status: Optional[QuoteStatus] = None
    quoted_price: Optional[float] = Field(None, ge=0)
    quote_notes: Optional[str] = None


class QuoteResponse(QuoteBase):
    """Schema for quote response"""
    id: int
    user_id: Optional[int] = None
    property_photos: Optional[str] = None
    status: QuoteStatus
    quoted_price: Optional[float] = None
    quote_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
