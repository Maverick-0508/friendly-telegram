"""
Work Order model for supervisor operations.
Represents a unit of field work linked to a client property/request.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class WorkOrderStatus(str, enum.Enum):
    """Work order lifecycle statuses"""
    INCOMING = "incoming"       # just created / forwarded from client request
    REVIEWED = "reviewed"       # supervisor has read and acknowledged it
    PLANNED = "planned"         # resources and tasks defined
    IN_PROGRESS = "in_progress" # field team is on-site
    COMPLETED = "completed"     # all tasks done, pending verification
    VERIFIED = "verified"       # admin / supervisor signed-off
    CANCELLED = "cancelled"


class WorkOrderPriority(str, enum.Enum):
    """Work order priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class WorkOrderSourceType(str, enum.Enum):
    """Where the work order originated"""
    QUOTE = "quote"
    CONTACT = "contact"
    APPOINTMENT = "appointment"
    EMAIL_DERIVED = "email_derived"
    MANUAL = "manual"


class WorkOrder(Base):
    """Work Order model"""
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True, index=True)

    # Origin / source tracking
    source_type = Column(SQLEnum(WorkOrderSourceType), default=WorkOrderSourceType.MANUAL, nullable=False)
    source_quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=True)
    source_contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    source_appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)

    # Client & property details (denormalised so the work order is self-contained)
    client_name = Column(String, nullable=False)
    client_email = Column(String, nullable=True)
    client_phone = Column(String, nullable=True)
    property_address = Column(String, nullable=False)
    service_type = Column(String, nullable=True)

    # Work description
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Planning
    priority = Column(SQLEnum(WorkOrderPriority), default=WorkOrderPriority.MEDIUM, nullable=False)
    required_skills = Column(Text, nullable=True)    # JSON list of skill strings
    target_date = Column(DateTime(timezone=True), nullable=True)
    planned_start_date = Column(DateTime(timezone=True), nullable=True)
    planned_end_date = Column(DateTime(timezone=True), nullable=True)

    # Assignment
    assigned_supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Status
    status = Column(SQLEnum(WorkOrderStatus), default=WorkOrderStatus.INCOMING, nullable=False, index=True)
    supervisor_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    task_items = relationship("TaskItem", back_populates="work_order", cascade="all, delete-orphan")
    field_logs = relationship("FieldLog", back_populates="work_order", cascade="all, delete-orphan")
    resource_plans = relationship("ResourcePlan", back_populates="work_order", cascade="all, delete-orphan")
    issue_notes = relationship("IssueNote", back_populates="work_order", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<WorkOrder {self.id} - {self.title} [{self.status}]>"
