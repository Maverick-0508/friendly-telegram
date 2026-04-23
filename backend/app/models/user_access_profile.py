"""
User access profile model for department assignment.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class UserAccessProfile(Base):
    """Department and access metadata for a user."""

    __tablename__ = "user_access_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    department = Column(String, nullable=False, index=True)
    cost_center = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")

    def __repr__(self):
        return f"<UserAccessProfile user_id={self.user_id} department={self.department}>"