"""
Pydantic schemas for API requests and responses
"""
from app.schemas.user import (
    UserCreate,
    UserLogin,
    UserUpdate,
    UserResponse,
    Token,
    TokenData,
    PasswordReset,
    PasswordResetConfirm,
)
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceResponse
from app.schemas.quote import QuoteCreate, QuoteUpdate, QuoteResponse
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate, AppointmentResponse
from app.schemas.contact import ContactCreate, ContactResponse
from app.schemas.testimonial import TestimonialCreate, TestimonialUpdate, TestimonialResponse
from app.schemas.work_order import (
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderResponse,
    WorkOrderForwardFromQuote,
    WorkOrderForwardFromContact,
    WorkOrderForwardFromAppointment,
)
from app.schemas.task_item import TaskItemCreate, TaskItemUpdate, TaskItemResponse
from app.schemas.field_log import FieldLogCreate, FieldLogUpdate, FieldLogResponse
from app.schemas.resource_plan import ResourcePlanCreate, ResourcePlanUpdate, ResourcePlanResponse
from app.schemas.issue_note import IssueNoteCreate, IssueNoteUpdate, IssueNoteResponse

__all__ = [
    "UserCreate",
    "UserLogin",
    "UserUpdate",
    "UserResponse",
    "Token",
    "TokenData",
    "PasswordReset",
    "PasswordResetConfirm",
    "ServiceCreate",
    "ServiceUpdate",
    "ServiceResponse",
    "QuoteCreate",
    "QuoteUpdate",
    "QuoteResponse",
    "AppointmentCreate",
    "AppointmentUpdate",
    "AppointmentResponse",
    "ContactCreate",
    "ContactResponse",
    "TestimonialCreate",
    "TestimonialUpdate",
    "TestimonialResponse",
    "WorkOrderCreate",
    "WorkOrderUpdate",
    "WorkOrderResponse",
    "WorkOrderForwardFromQuote",
    "WorkOrderForwardFromContact",
    "WorkOrderForwardFromAppointment",
    "TaskItemCreate",
    "TaskItemUpdate",
    "TaskItemResponse",
    "FieldLogCreate",
    "FieldLogUpdate",
    "FieldLogResponse",
    "ResourcePlanCreate",
    "ResourcePlanUpdate",
    "ResourcePlanResponse",
    "IssueNoteCreate",
    "IssueNoteUpdate",
    "IssueNoteResponse",
]
