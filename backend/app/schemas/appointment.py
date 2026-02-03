"""
Appointment schemas for API requests and responses
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from app.models.appointment import AppointmentStatus


class AppointmentBase(BaseModel):
    """Base appointment schema"""
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=1, max_length=20)
    service_type: str = Field(..., min_length=1, max_length=200)
    address: str = Field(..., min_length=1, max_length=500)
    scheduled_date: datetime
    duration_minutes: int = Field(60, ge=15, le=480)
    notes: Optional[str] = None


class AppointmentCreate(AppointmentBase):
    """Schema for creating an appointment"""
    pass


class AppointmentUpdate(BaseModel):
    """Schema for updating an appointment"""
    scheduled_date: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=15, le=480)
    status: Optional[AppointmentStatus] = None
    notes: Optional[str] = None
    admin_notes: Optional[str] = None
    cancellation_reason: Optional[str] = None


class AppointmentResponse(AppointmentBase):
    """Schema for appointment response"""
    id: int
    user_id: Optional[int] = None
    quote_id: Optional[int] = None
    scheduled_end_date: Optional[datetime] = None
    status: AppointmentStatus
    admin_notes: Optional[str] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
