"""
Task Item schemas for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.task_item import TaskItemStatus


class TaskItemBase(BaseModel):
    """Base task item schema"""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    is_client_requested: bool = False
    assignee_name: Optional[str] = Field(None, max_length=100)
    due_date: Optional[datetime] = None


class TaskItemCreate(TaskItemBase):
    """Schema for creating a task item"""
    work_order_id: int


class TaskItemUpdate(BaseModel):
    """Schema for updating a task item"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    assignee_name: Optional[str] = Field(None, max_length=100)
    due_date: Optional[datetime] = None
    status: Optional[TaskItemStatus] = None


class TaskItemResponse(TaskItemBase):
    """Schema for task item response"""
    id: int
    work_order_id: int
    status: TaskItemStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
