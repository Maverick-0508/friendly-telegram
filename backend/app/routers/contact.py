"""
Contact router for managing contact form submissions
"""
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.contact import Contact
from app.models.user import User
from app.schemas.contact import ContactCreate, ContactResponse
from app.utils.auth import get_current_admin_user
from app.utils.email import send_contact_form_notification

router = APIRouter(prefix="/contact", tags=["Contact"])


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(contact_data: ContactCreate, db: Session = Depends(get_db)):
    """
    Submit a contact form
    """
    db_contact = Contact(**contact_data.model_dump())
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    
    # Send notification email to admin
    await send_contact_form_notification({
        "full_name": db_contact.full_name,
        "email": db_contact.email,
        "phone": db_contact.phone,
        "subject": db_contact.subject,
        "service_type": db_contact.service_type,
        "message": db_contact.message,
    })
    
    return db_contact


@router.get("", response_model=List[ContactResponse])
def get_contacts(
    skip: int = 0,
    limit: int = 100,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Get all contact form submissions (admin only)
    """
    query = db.query(Contact)
    
    if unread_only:
        query = query.filter(Contact.is_read == False)
    
    contacts = query.order_by(Contact.created_at.desc()).offset(skip).limit(limit).all()
    return contacts


@router.get("/{contact_id}", response_model=ContactResponse)
def get_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Get a specific contact form submission (admin only)
    """
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact submission not found"
        )
    
    # Mark as read
    if not contact.is_read:
        contact.is_read = True
        contact.read_at = datetime.utcnow()
        db.commit()
        db.refresh(contact)
    
    return contact


@router.put("/{contact_id}/mark-replied", response_model=ContactResponse)
def mark_contact_replied(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Mark a contact submission as replied (admin only)
    """
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact submission not found"
        )
    
    contact.is_replied = True
    contact.replied_at = datetime.utcnow()
    
    if not contact.is_read:
        contact.is_read = True
        contact.read_at = datetime.utcnow()
    
    db.commit()
    db.refresh(contact)
    
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Delete a contact form submission (admin only)
    """
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact submission not found"
        )
    
    db.delete(contact)
    db.commit()
    
    return None
