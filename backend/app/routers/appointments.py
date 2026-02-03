"""
Appointments router for managing appointment scheduling
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate, AppointmentResponse
from app.utils.auth import get_current_user, get_current_admin_user
from app.utils.email import send_appointment_confirmation

router = APIRouter(prefix="/appointments", tags=["Appointments"])


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    appointment_data: AppointmentCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new appointment
    """
    # Create appointment
    db_appointment = Appointment(**appointment_data.model_dump())
    
    # Calculate end date based on duration
    db_appointment.scheduled_end_date = datetime.fromtimestamp(
        appointment_data.scheduled_date.timestamp() + (appointment_data.duration_minutes * 60)
    )
    
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    
    # Send confirmation email
    await send_appointment_confirmation({
        "full_name": db_appointment.full_name,
        "email": db_appointment.email,
        "service_type": db_appointment.service_type,
        "scheduled_date": db_appointment.scheduled_date.strftime("%Y-%m-%d %H:%M"),
        "address": db_appointment.address,
        "duration_minutes": db_appointment.duration_minutes,
    })
    
    return db_appointment


@router.get("", response_model=List[AppointmentResponse])
def get_appointments(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[AppointmentStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Get all appointments (admin only)
    """
    query = db.query(Appointment)
    
    if status_filter:
        query = query.filter(Appointment.status == status_filter)
    
    appointments = query.order_by(Appointment.scheduled_date.desc()).offset(skip).limit(limit).all()
    return appointments


@router.get("/user/{user_id}", response_model=List[AppointmentResponse])
def get_user_appointments(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all appointments for a specific user
    """
    # Check permissions
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view these appointments"
        )
    
    appointments = db.query(Appointment).filter(
        Appointment.user_id == user_id
    ).order_by(Appointment.scheduled_date.desc()).all()
    
    return appointments


@router.get("/{appointment_id}", response_model=AppointmentResponse)
def get_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific appointment
    """
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
    
    # Check permissions
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN and appointment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this appointment"
        )
    
    return appointment


@router.put("/{appointment_id}", response_model=AppointmentResponse)
def update_appointment(
    appointment_id: int,
    appointment_data: AppointmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an appointment
    """
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
    
    # Check permissions
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN and appointment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this appointment"
        )
    
    # Update appointment
    update_data = appointment_data.model_dump(exclude_unset=True)
    
    # Set timestamps based on status changes
    if "status" in update_data:
        if update_data["status"] == AppointmentStatus.CONFIRMED and not appointment.confirmed_at:
            appointment.confirmed_at = datetime.utcnow()
        elif update_data["status"] == AppointmentStatus.COMPLETED and not appointment.completed_at:
            appointment.completed_at = datetime.utcnow()
    
    # Update scheduled_end_date if scheduled_date or duration changes
    if "scheduled_date" in update_data or "duration_minutes" in update_data:
        scheduled_date = update_data.get("scheduled_date", appointment.scheduled_date)
        duration = update_data.get("duration_minutes", appointment.duration_minutes)
        appointment.scheduled_end_date = datetime.fromtimestamp(
            scheduled_date.timestamp() + (duration * 60)
        )
    
    for field, value in update_data.items():
        setattr(appointment, field, value)
    
    db.commit()
    db.refresh(appointment)
    
    return appointment


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete/Cancel an appointment
    """
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )
    
    # Check permissions
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN and appointment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this appointment"
        )
    
    db.delete(appointment)
    db.commit()
    
    return None
