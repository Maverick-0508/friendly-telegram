"""
Service model for lawn care services
"""
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.database import Base


class Service(Base):
    """Service model"""
    __tablename__ = "services"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=False)
    short_description = Column(String, nullable=True)
    base_price = Column(Float, nullable=False)
    price_unit = Column(String, default="per service")  # e.g., "per hour", "per sqm"
    features = Column(JSON, nullable=True)  # List of service features
    icon = Column(String, nullable=True)  # Icon class or image URL
    is_active = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Service {self.name}>"
