"""
Quotes router for managing quote requests
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.quote import Quote, QuoteStatus
from app.models.user import User
from app.schemas.quote import QuoteCreate, QuoteUpdate, QuoteResponse
from app.utils.auth import get_current_user, get_current_admin_user
from app.utils.email import send_quote_confirmation

router = APIRouter(prefix="/quotes", tags=["Quotes"])


@router.post("", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(quote_data: QuoteCreate, db: Session = Depends(get_db)):
    """
    Create a new quote request
    """
    db_quote = Quote(**quote_data.model_dump())
    db.add(db_quote)
    db.commit()
    db.refresh(db_quote)
    
    # Send confirmation email
    await send_quote_confirmation({
        "full_name": db_quote.full_name,
        "email": db_quote.email,
        "service_type": db_quote.service_type,
        "address": db_quote.address,
        "property_size": db_quote.property_size,
    })
    
    return db_quote


@router.get("", response_model=List[QuoteResponse])
def get_quotes(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[QuoteStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Get all quote requests (admin only)
    """
    query = db.query(Quote)
    
    if status_filter:
        query = query.filter(Quote.status == status_filter)
    
    quotes = query.order_by(Quote.created_at.desc()).offset(skip).limit(limit).all()
    return quotes


@router.get("/{quote_id}", response_model=QuoteResponse)
def get_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific quote request
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    # Check permissions: admin can see all, users can only see their own
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN and quote.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this quote"
        )
    
    return quote


@router.put("/{quote_id}", response_model=QuoteResponse)
def update_quote(
    quote_id: int,
    quote_data: QuoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Update a quote request (admin only)
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    # Update quote
    update_data = quote_data.model_dump(exclude_unset=True)
    
    # Set reviewed_at timestamp if status is being updated to reviewed or later
    if "status" in update_data and update_data["status"] != QuoteStatus.PENDING:
        if not quote.reviewed_at:
            quote.reviewed_at = datetime.utcnow()
    
    for field, value in update_data.items():
        setattr(quote, field, value)
    
    db.commit()
    db.refresh(quote)
    
    return quote


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Delete a quote request (admin only)
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    db.delete(quote)
    db.commit()
    
    return None


@router.get("/user/{user_id}", response_model=List[QuoteResponse])
def get_user_quotes(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all quotes for a specific user
    """
    # Check permissions
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view these quotes"
        )
    
    quotes = db.query(Quote).filter(Quote.user_id == user_id).order_by(Quote.created_at.desc()).all()
    return quotes
