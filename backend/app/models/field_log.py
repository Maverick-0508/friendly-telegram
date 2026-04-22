"""
Field Log model – records what was actually done on-site for a Work Order.
Provides the "executed" side that is compared against "expected" TaskItems.
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class FieldLog(Base):
    """Field Log model"""
    __tablename__ = "field_logs"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False, index=True)
    logged_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # What was done
    work_done_summary = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)

    # Resources consumed
    materials_used = Column(Text, nullable=True)   # JSON list of {name, quantity, unit}
    labor_hours = Column(Float, nullable=True)

    # Evidence
    photos = Column(Text, nullable=True)            # JSON list of image URLs

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    work_order = relationship("WorkOrder", back_populates="field_logs")

    def __repr__(self):
        return f"<FieldLog {self.id} for WorkOrder {self.work_order_id}>"
