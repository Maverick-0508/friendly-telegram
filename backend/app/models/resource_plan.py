"""
Resource Plan model – captures planned crew and equipment before dispatch.
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ResourcePlan(Base):
    """Resource Plan model"""
    __tablename__ = "resource_plans"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Crew
    crew_count = Column(Integer, default=1, nullable=False)
    crew_names = Column(Text, nullable=True)           # JSON list of crew member names

    # Equipment
    equipment_list = Column(Text, nullable=True)       # JSON list of equipment strings

    # Labour estimate
    estimated_labor_hours = Column(Float, nullable=True)

    # Notes
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship
    work_order = relationship("WorkOrder", back_populates="resource_plans")

    def __repr__(self):
        return f"<ResourcePlan {self.id} for WorkOrder {self.work_order_id}>"
