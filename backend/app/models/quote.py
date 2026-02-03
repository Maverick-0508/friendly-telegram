"""
Quote request model
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class QuoteStatus(str, enum.Enum):
    """Quote request statuses"""
    PENDING = "pending"
    REVIEWED = "reviewed"
    QUOTED = "quoted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class Quote(Base):
    """Quote request model"""
    __tablename__ = "quotes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Contact Information
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    
    # Property Information
    address = Column(String, nullable=False)
    property_size = Column(Float, nullable=True)  # in square meters
    property_type = Column(String, nullable=True)  # residential, commercial, etc.
    
    # Service Details
    service_type = Column(String, nullable=False)
    service_frequency = Column(String, nullable=True)  # one-time, weekly, bi-weekly, monthly
    preferred_start_date = Column(DateTime(timezone=True), nullable=True)
    
    # Additional Details
    additional_details = Column(Text, nullable=True)
    property_photos = Column(Text, nullable=True)  # JSON array of image URLs
    
    # Quote Information
    status = Column(SQLEnum(QuoteStatus), default=QuoteStatus.PENDING, nullable=False)
    quoted_price = Column(Float, nullable=True)
    quote_notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Quote {self.id} - {self.full_name}>"
