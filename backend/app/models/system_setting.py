"""
System setting model for centralized configuration.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class SystemSetting(Base):
    """Editable system configuration item."""

    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String, unique=True, index=True, nullable=False)
    label = Column(String, nullable=False)
    group_name = Column(String, nullable=False, index=True)
    value = Column(Text, nullable=False, default="")
    description = Column(Text, nullable=True)
    is_sensitive = Column(Boolean, default=False, nullable=False)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    updated_by = relationship("User")

    def __repr__(self):
        return f"<SystemSetting {self.setting_key}>"