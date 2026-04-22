"""
Issue / Risk Note model – blockers, access issues, weather, extra scope, etc.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class IssueType(str, enum.Enum):
    """Categories of issues that can arise on a job"""
    BLOCKER = "blocker"
    ACCESS_ISSUE = "access_issue"
    WEATHER = "weather"
    EXTRA_SCOPE = "extra_scope"
    SAFETY = "safety"
    OTHER = "other"


class IssueSeverity(str, enum.Enum):
    """Severity levels for an issue"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class IssueNote(Base):
    """Issue / Risk Note model"""
    __tablename__ = "issue_notes"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False, index=True)
    logged_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Issue classification
    issue_type = Column(SQLEnum(IssueType), default=IssueType.OTHER, nullable=False)
    severity = Column(SQLEnum(IssueSeverity), default=IssueSeverity.MEDIUM, nullable=False)

    # Details
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Resolution
    is_resolved = Column(Boolean, default=False, nullable=False)
    resolution_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationship
    work_order = relationship("WorkOrder", back_populates="issue_notes")

    def __repr__(self):
        return f"<IssueNote {self.id} [{self.issue_type}] for WorkOrder {self.work_order_id}>"
