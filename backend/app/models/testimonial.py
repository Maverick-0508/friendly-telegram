"""
Testimonial model
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.sql import func
from app.database import Base


class Testimonial(Base):
    """Testimonial model"""
    __tablename__ = "testimonials"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Customer Information
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=True)
    customer_location = Column(String, nullable=True)
    customer_avatar = Column(String, nullable=True)  # URL to avatar image
    
    # Testimonial Content
    rating = Column(Float, nullable=False, default=5.0)  # 1-5 stars
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    service_type = Column(String, nullable=True)
    
    # Status
    is_approved = Column(Boolean, default=False)
    is_featured = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Testimonial {self.id} - {self.customer_name}>"
