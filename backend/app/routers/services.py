"""
Services router for managing lawn care services
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.service import Service
from app.models.user import User
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceResponse
from app.utils.auth import get_current_admin_user

router = APIRouter(prefix="/services", tags=["Services"])


@router.get("", response_model=List[ServiceResponse])
def get_services(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """
    Get all services
    """
    query = db.query(Service)
    
    if active_only:
        query = query.filter(Service.is_active == True)
    
    services = query.order_by(Service.display_order, Service.name).offset(skip).limit(limit).all()
    return services


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(service_id: int, db: Session = Depends(get_db)):
    """
    Get a specific service by ID
    """
    service = db.query(Service).filter(Service.id == service_id).first()
    
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found"
        )
    
    return service


@router.get("/slug/{slug}", response_model=ServiceResponse)
def get_service_by_slug(slug: str, db: Session = Depends(get_db)):
    """
    Get a specific service by slug
    """
    service = db.query(Service).filter(Service.slug == slug).first()
    
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found"
        )
    
    return service


@router.post("", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    service_data: ServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Create a new service (admin only)
    """
    # Check if slug already exists
    existing_service = db.query(Service).filter(Service.slug == service_data.slug).first()
    if existing_service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Service with this slug already exists"
        )
    
    db_service = Service(**service_data.model_dump())
    db.add(db_service)
    db.commit()
    db.refresh(db_service)
    
    return db_service


@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int,
    service_data: ServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Update a service (admin only)
    """
    service = db.query(Service).filter(Service.id == service_id).first()
    
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found"
        )
    
    # Check if slug is being changed and if it already exists
    if service_data.slug and service_data.slug != service.slug:
        existing_service = db.query(Service).filter(Service.slug == service_data.slug).first()
        if existing_service:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service with this slug already exists"
            )
    
    # Update service
    update_data = service_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(service, field, value)
    
    db.commit()
    db.refresh(service)
    
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Delete a service (admin only)
    """
    service = db.query(Service).filter(Service.id == service_id).first()
    
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found"
        )
    
    db.delete(service)
    db.commit()
    
    return None
