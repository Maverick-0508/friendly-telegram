"""
Testimonials router for managing customer testimonials
"""
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.testimonial import Testimonial
from app.models.user import User
from app.schemas.testimonial import TestimonialCreate, TestimonialUpdate, TestimonialResponse
from app.utils.auth import get_current_admin_user

router = APIRouter(prefix="/testimonials", tags=["Testimonials"])


@router.get("", response_model=List[TestimonialResponse])
def get_testimonials(
    skip: int = 0,
    limit: int = 100,
    approved_only: bool = True,
    featured_only: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get all testimonials
    """
    query = db.query(Testimonial)
    
    if approved_only:
        query = query.filter(Testimonial.is_approved == True)
    
    if featured_only:
        query = query.filter(Testimonial.is_featured == True)
    
    testimonials = query.order_by(
        Testimonial.is_featured.desc(),
        Testimonial.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    return testimonials


@router.get("/{testimonial_id}", response_model=TestimonialResponse)
def get_testimonial(testimonial_id: int, db: Session = Depends(get_db)):
    """
    Get a specific testimonial
    """
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    
    if not testimonial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Testimonial not found"
        )
    
    return testimonial


@router.post("", response_model=TestimonialResponse, status_code=status.HTTP_201_CREATED)
def create_testimonial(testimonial_data: TestimonialCreate, db: Session = Depends(get_db)):
    """
    Submit a new testimonial
    """
    db_testimonial = Testimonial(**testimonial_data.model_dump())
    db_testimonial.is_approved = False  # Requires approval
    db_testimonial.is_featured = False
    
    db.add(db_testimonial)
    db.commit()
    db.refresh(db_testimonial)
    
    return db_testimonial


@router.put("/{testimonial_id}", response_model=TestimonialResponse)
def update_testimonial(
    testimonial_id: int,
    testimonial_data: TestimonialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Update a testimonial (admin only)
    """
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    
    if not testimonial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Testimonial not found"
        )
    
    # Update testimonial
    update_data = testimonial_data.model_dump(exclude_unset=True)
    
    # Set approved_at timestamp if being approved
    if "is_approved" in update_data and update_data["is_approved"] and not testimonial.is_approved:
        testimonial.approved_at = datetime.utcnow()
    
    for field, value in update_data.items():
        setattr(testimonial, field, value)
    
    db.commit()
    db.refresh(testimonial)
    
    return testimonial


@router.delete("/{testimonial_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_testimonial(
    testimonial_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Delete a testimonial (admin only)
    """
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    
    if not testimonial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Testimonial not found"
        )
    
    db.delete(testimonial)
    db.commit()
    
    return None


@router.post("/{testimonial_id}/approve", response_model=TestimonialResponse)
def approve_testimonial(
    testimonial_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Approve a testimonial (admin only)
    """
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    
    if not testimonial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Testimonial not found"
        )
    
    testimonial.is_approved = True
    testimonial.approved_at = datetime.utcnow()
    
    db.commit()
    db.refresh(testimonial)
    
    return testimonial


@router.post("/{testimonial_id}/feature", response_model=TestimonialResponse)
def feature_testimonial(
    testimonial_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Feature a testimonial (admin only)
    """
    testimonial = db.query(Testimonial).filter(Testimonial.id == testimonial_id).first()
    
    if not testimonial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Testimonial not found"
        )
    
    # Approve if not already approved
    if not testimonial.is_approved:
        testimonial.is_approved = True
        testimonial.approved_at = datetime.utcnow()
    
    testimonial.is_featured = True
    
    db.commit()
    db.refresh(testimonial)
    
    return testimonial
