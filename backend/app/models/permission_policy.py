"""
Permission policy model for department and role based access control.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func

from app.database import Base


class PermissionPolicy(Base):
    """Policy that controls access to a feature or report."""

    __tablename__ = "permission_policies"

    id = Column(Integer, primary_key=True, index=True)
    feature_key = Column(String, unique=True, index=True, nullable=False)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    allowed_roles = Column(String, nullable=False, default="admin,supervisor")
    allowed_departments = Column(String, nullable=False, default="")
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<PermissionPolicy {self.feature_key}>"