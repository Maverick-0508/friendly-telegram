"""
Work Order schemas for API requests and responses
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from app.models.work_order import WorkOrderStatus, WorkOrderPriority, WorkOrderSourceType


class WorkOrderBase(BaseModel):
    """Base work order schema"""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    client_name: str = Field(..., min_length=1, max_length=100)
    client_email: Optional[str] = None
    client_phone: Optional[str] = Field(None, max_length=20)
    property_address: str = Field(..., min_length=1, max_length=500)
    service_type: Optional[str] = Field(None, max_length=200)
    priority: WorkOrderPriority = WorkOrderPriority.MEDIUM
    required_skills: Optional[str] = None
    target_date: Optional[datetime] = None
    planned_start_date: Optional[datetime] = None
    planned_end_date: Optional[datetime] = None
    supervisor_notes: Optional[str] = None


class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order manually"""
    source_type: WorkOrderSourceType = WorkOrderSourceType.MANUAL
    assigned_supervisor_id: Optional[int] = None


class WorkOrderForwardFromQuote(BaseModel):
    """Forward a quote request into a new work order"""
    quote_id: int
    title: Optional[str] = None
    priority: WorkOrderPriority = WorkOrderPriority.MEDIUM
    target_date: Optional[datetime] = None
    assigned_supervisor_id: Optional[int] = None
    supervisor_notes: Optional[str] = None


class WorkOrderForwardFromContact(BaseModel):
    """Forward a contact submission into a new work order"""
    contact_id: int
    title: Optional[str] = None
    priority: WorkOrderPriority = WorkOrderPriority.MEDIUM
    target_date: Optional[datetime] = None
    assigned_supervisor_id: Optional[int] = None
    supervisor_notes: Optional[str] = None


class WorkOrderForwardFromAppointment(BaseModel):
    """Forward an appointment into a new work order"""
    appointment_id: int
    title: Optional[str] = None
    priority: WorkOrderPriority = WorkOrderPriority.MEDIUM
    assigned_supervisor_id: Optional[int] = None
    supervisor_notes: Optional[str] = None


class WorkOrderUpdate(BaseModel):
    """Schema for updating a work order"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    service_type: Optional[str] = Field(None, max_length=200)
    priority: Optional[WorkOrderPriority] = None
    status: Optional[WorkOrderStatus] = None
    required_skills: Optional[str] = None
    target_date: Optional[datetime] = None
    planned_start_date: Optional[datetime] = None
    planned_end_date: Optional[datetime] = None
    assigned_supervisor_id: Optional[int] = None
    supervisor_notes: Optional[str] = None


class WorkOrderResponse(WorkOrderBase):
    """Schema for work order response"""
    id: int
    source_type: WorkOrderSourceType
    source_quote_id: Optional[int] = None
    source_contact_id: Optional[int] = None
    source_appointment_id: Optional[int] = None
    assigned_supervisor_id: Optional[int] = None
    status: WorkOrderStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None

    class Config:
        from_attributes = True
