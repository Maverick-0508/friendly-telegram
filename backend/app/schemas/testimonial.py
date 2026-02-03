"""
Testimonial schemas for API requests and responses
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class TestimonialBase(BaseModel):
    """Base testimonial schema"""
    customer_name: str = Field(..., min_length=1, max_length=100)
    customer_email: Optional[EmailStr] = None
    customer_location: Optional[str] = Field(None, max_length=100)
    customer_avatar: Optional[str] = None
    rating: float = Field(..., ge=1, le=5)
    title: Optional[str] = Field(None, max_length=200)
    content: str = Field(..., min_length=1, max_length=1000)
    service_type: Optional[str] = Field(None, max_length=200)


class TestimonialCreate(TestimonialBase):
    """Schema for creating a testimonial"""
    pass


class TestimonialUpdate(BaseModel):
    """Schema for updating a testimonial"""
    is_approved: Optional[bool] = None
    is_featured: Optional[bool] = None
    customer_name: Optional[str] = Field(None, min_length=1, max_length=100)
    customer_location: Optional[str] = Field(None, max_length=100)
    rating: Optional[float] = Field(None, ge=1, le=5)
    title: Optional[str] = Field(None, max_length=200)
    content: Optional[str] = Field(None, min_length=1, max_length=1000)


class TestimonialResponse(TestimonialBase):
    """Schema for testimonial response"""
    id: int
    user_id: Optional[int] = None
    is_approved: bool
    is_featured: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
