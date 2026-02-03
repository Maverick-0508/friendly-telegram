"""
Admin router for dashboard statistics and management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from app.database import get_db
from app.models.user import User
from app.models.quote import Quote, QuoteStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.contact import Contact
from app.models.testimonial import Testimonial
from app.utils.auth import get_current_admin_user

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Get dashboard statistics (admin only)
    """
    # Total counts
    total_quotes = db.query(Quote).count()
    total_appointments = db.query(Appointment).count()
    total_contacts = db.query(Contact).count()
    total_testimonials = db.query(Testimonial).filter(Testimonial.is_approved == True).count()
    total_users = db.query(User).count()
    
    # Pending items
    pending_quotes = db.query(Quote).filter(Quote.status == QuoteStatus.PENDING).count()
    pending_testimonials = db.query(Testimonial).filter(Testimonial.is_approved == False).count()
    unread_contacts = db.query(Contact).filter(Contact.is_read == False).count()
    
    # Appointments by status
    scheduled_appointments = db.query(Appointment).filter(
        Appointment.status == AppointmentStatus.SCHEDULED
    ).count()
    confirmed_appointments = db.query(Appointment).filter(
        Appointment.status == AppointmentStatus.CONFIRMED
    ).count()
    completed_appointments = db.query(Appointment).filter(
        Appointment.status == AppointmentStatus.COMPLETED
    ).count()
    
    # Quotes by status
    quotes_by_status = db.query(
        Quote.status,
        func.count(Quote.id).label('count')
    ).group_by(Quote.status).all()
    
    quotes_status_breakdown = {status.value: 0 for status in QuoteStatus}
    for status, count in quotes_by_status:
        quotes_status_breakdown[status.value] = count
    
    # Recent activity (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    recent_quotes = db.query(Quote).filter(Quote.created_at >= thirty_days_ago).count()
    recent_appointments = db.query(Appointment).filter(
        Appointment.created_at >= thirty_days_ago
    ).count()
    recent_contacts = db.query(Contact).filter(Contact.created_at >= thirty_days_ago).count()
    
    # Conversion rates
    conversion_rate = 0
    if total_quotes > 0:
        accepted_quotes = db.query(Quote).filter(Quote.status == QuoteStatus.ACCEPTED).count()
        conversion_rate = round((accepted_quotes / total_quotes) * 100, 2)
    
    # Average rating
    avg_rating = db.query(func.avg(Testimonial.rating)).filter(
        Testimonial.is_approved == True
    ).scalar() or 0
    avg_rating = round(float(avg_rating), 2) if avg_rating else 0
    
    return {
        "totals": {
            "quotes": total_quotes,
            "appointments": total_appointments,
            "contacts": total_contacts,
            "testimonials": total_testimonials,
            "users": total_users,
        },
        "pending": {
            "quotes": pending_quotes,
            "testimonials": pending_testimonials,
            "contacts": unread_contacts,
        },
        "appointments": {
            "scheduled": scheduled_appointments,
            "confirmed": confirmed_appointments,
            "completed": completed_appointments,
        },
        "quotes_by_status": quotes_status_breakdown,
        "recent_activity": {
            "quotes": recent_quotes,
            "appointments": recent_appointments,
            "contacts": recent_contacts,
        },
        "metrics": {
            "conversion_rate": conversion_rate,
            "average_rating": avg_rating,
        }
    }


@router.get("/service-area/check")
def check_service_area(
    latitude: float,
    longitude: float,
    db: Session = Depends(get_db)
):
    """
    Check if a location is within the service area
    """
    from app.utils.validators import validate_service_area
    
    result = validate_service_area(latitude, longitude)
    return result


@router.post("/service-area/check")
def check_service_area_post(
    data: dict,
    db: Session = Depends(get_db)
):
    """
    Check if a location is within the service area (POST version)
    """
    from app.utils.validators import validate_service_area
    
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    
    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Latitude and longitude are required"
        )
    
    result = validate_service_area(latitude, longitude)
    return result
