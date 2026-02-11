"""
Contact form submission model
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Contact(Base):
    """Contact form submission model"""
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Contact Information
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    
    # Subject and Message
    subject = Column(String, nullable=True)
    service_type = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    
    # Status
    is_read = Column(Boolean, default=False)
    is_replied = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)
    replied_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Contact {self.id} - {self.full_name}>"
