"""
Task Item model – checklist entry under a Work Order.
Distinguishes client-requested tasks from supervisor-added tasks so
planned vs expected variance is visible.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TaskItemStatus(str, enum.Enum):
    """Task item lifecycle statuses"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    SKIPPED = "skipped"


class TaskItem(Base):
    """Task Item model"""
    __tablename__ = "task_items"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False, index=True)

    # Task details
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Origin flag: True if the task was extracted from a client request/email
    is_client_requested = Column(Boolean, default=False, nullable=False)

    # Assignment & scheduling
    assignee_name = Column(String, nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)

    # Status
    status = Column(SQLEnum(TaskItemStatus), default=TaskItemStatus.PENDING, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationship
    work_order = relationship("WorkOrder", back_populates="task_items")

    def __repr__(self):
        return f"<TaskItem {self.id} - {self.title} [{self.status}]>"
