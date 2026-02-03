"""
Contact schemas for API requests and responses
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class ContactBase(BaseModel):
    """Base contact schema"""
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    subject: Optional[str] = Field(None, max_length=200)
    service_type: Optional[str] = Field(None, max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)


class ContactCreate(ContactBase):
    """Schema for creating a contact submission"""
    pass


class ContactResponse(ContactBase):
    """Schema for contact response"""
    id: int
    is_read: bool
    is_replied: bool
    created_at: datetime
    read_at: Optional[datetime] = None
    replied_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
