"""
Work Orders router – CRUD plus forwarding pipeline from client requests.
Accessible to supervisors and admins.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.work_order import WorkOrder, WorkOrderStatus, WorkOrderSourceType
from app.models.quote import Quote
from app.models.contact import Contact
from app.models.appointment import Appointment
from app.models.user import User, UserRole
from app.schemas.work_order import (
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderResponse,
    WorkOrderForwardFromQuote,
    WorkOrderForwardFromContact,
    WorkOrderForwardFromAppointment,
)
from app.utils.auth import get_current_user, get_current_supervisor_or_admin_user, get_current_admin_user
from app.utils.audit import record_audit_log

router = APIRouter(prefix="/work-orders", tags=["Work Orders"])


ALLOWED_STATUS_TRANSITIONS = {
    WorkOrderStatus.INCOMING: {WorkOrderStatus.REVIEWED, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.REVIEWED: {WorkOrderStatus.PLANNED, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.PLANNED: {WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.IN_PROGRESS: {WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED},
    WorkOrderStatus.COMPLETED: {WorkOrderStatus.VERIFIED},
    WorkOrderStatus.VERIFIED: set(),
    WorkOrderStatus.CANCELLED: set(),
}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def create_work_order(
    data: WorkOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Create a work order manually (supervisor/admin only)"""
    wo = WorkOrder(**data.model_dump())
    db.add(wo)
    db.commit()
    db.refresh(wo)
    record_audit_log(
        db,
        actor=current_user,
        action="work_order.create",
        resource_type="work_order",
        resource_id=wo.id,
        summary=f"Created work order #{wo.id}",
        details={"source_type": wo.source_type.value},
    )
    db.commit()
    return wo


@router.get("", response_model=List[WorkOrderResponse])
def list_work_orders(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[WorkOrderStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """List all work orders (supervisor/admin only)"""
    query = db.query(WorkOrder)
    if status_filter:
        query = query.filter(WorkOrder.status == status_filter)
    return query.order_by(WorkOrder.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{work_order_id}", response_model=WorkOrderResponse)
def get_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Get a specific work order (supervisor/admin only)"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    return wo


@router.put("/{work_order_id}", response_model=WorkOrderResponse)
def update_work_order(
    work_order_id: int,
    data: WorkOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Update a work order (supervisor/admin only)"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")

    update_data = data.model_dump(exclude_unset=True)

    # Set lifecycle timestamps automatically
    if "status" in update_data:
        new_status = update_data["status"]

        if new_status != wo.status and current_user.role != UserRole.ADMIN:
            allowed = ALLOWED_STATUS_TRANSITIONS.get(wo.status, set())
            if new_status not in allowed:
                allowed_labels = ", ".join(s.value for s in sorted(allowed, key=lambda x: x.value)) or "none"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Invalid status transition from '{wo.status.value}' to '{new_status.value}'. "
                        f"Allowed next statuses: {allowed_labels}."
                    ),
                )

        if new_status == WorkOrderStatus.IN_PROGRESS and not wo.started_at:
            wo.started_at = datetime.utcnow()
        elif new_status == WorkOrderStatus.COMPLETED and not wo.completed_at:
            wo.completed_at = datetime.utcnow()
        elif new_status == WorkOrderStatus.VERIFIED and not wo.verified_at:
            wo.verified_at = datetime.utcnow()

    for field, value in update_data.items():
        setattr(wo, field, value)

    db.commit()
    db.refresh(wo)
    return wo


@router.delete("/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Delete a work order (admin only)"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    db.delete(wo)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Forwarding pipeline
# ---------------------------------------------------------------------------

@router.post("/forward/quote", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def forward_from_quote(
    data: WorkOrderForwardFromQuote,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Create a work order pre-filled from an existing quote request.
    The supervisor can review and adjust before confirming.
    """
    quote = db.query(Quote).filter(Quote.id == data.quote_id).first()
    if not quote:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    title = data.title or f"Quote #{quote.id} – {quote.service_type}"
    wo = WorkOrder(
        source_type=WorkOrderSourceType.QUOTE,
        source_quote_id=quote.id,
        client_name=quote.full_name,
        client_email=quote.email,
        client_phone=quote.phone,
        property_address=quote.address,
        service_type=quote.service_type,
        title=title,
        description=quote.additional_details,
        priority=data.priority,
        target_date=data.target_date or quote.preferred_start_date,
        assigned_supervisor_id=data.assigned_supervisor_id,
        supervisor_notes=data.supervisor_notes,
        status=WorkOrderStatus.INCOMING,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    record_audit_log(
        db,
        actor=current_user,
        action="work_order.forward.quote",
        resource_type="work_order",
        resource_id=wo.id,
        summary=f"Forwarded quote #{quote.id} into work order #{wo.id}",
        details={"quote_id": quote.id},
    )
    db.commit()
    return wo


@router.post("/forward/contact", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def forward_from_contact(
    data: WorkOrderForwardFromContact,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Create a work order pre-filled from a contact form submission.
    """
    contact = db.query(Contact).filter(Contact.id == data.contact_id).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact submission not found")

    title = data.title or f"Contact #{contact.id} – {contact.subject or contact.service_type or 'General Enquiry'}"
    wo = WorkOrder(
        source_type=WorkOrderSourceType.CONTACT,
        source_contact_id=contact.id,
        client_name=contact.full_name,
        client_email=contact.email,
        client_phone=contact.phone,
        property_address="TBD – see contact message",
        service_type=contact.service_type,
        title=title,
        description=contact.message,
        priority=data.priority,
        target_date=data.target_date,
        assigned_supervisor_id=data.assigned_supervisor_id,
        supervisor_notes=data.supervisor_notes,
        status=WorkOrderStatus.INCOMING,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    record_audit_log(
        db,
        actor=current_user,
        action="work_order.forward.contact",
        resource_type="work_order",
        resource_id=wo.id,
        summary=f"Forwarded contact #{contact.id} into work order #{wo.id}",
        details={"contact_id": contact.id},
    )
    db.commit()
    return wo


@router.post("/forward/appointment", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def forward_from_appointment(
    data: WorkOrderForwardFromAppointment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Create a work order pre-filled from a confirmed appointment.
    """
    appt = db.query(Appointment).filter(Appointment.id == data.appointment_id).first()
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

    title = data.title or f"Appointment #{appt.id} – {appt.service_type}"
    wo = WorkOrder(
        source_type=WorkOrderSourceType.APPOINTMENT,
        source_appointment_id=appt.id,
        client_name=appt.full_name,
        client_email=appt.email,
        client_phone=appt.phone,
        property_address=appt.address,
        service_type=appt.service_type,
        title=title,
        description=appt.notes,
        priority=data.priority,
        target_date=appt.scheduled_date,
        planned_start_date=appt.scheduled_date,
        planned_end_date=appt.scheduled_end_date,
        assigned_supervisor_id=data.assigned_supervisor_id,
        supervisor_notes=data.supervisor_notes,
        status=WorkOrderStatus.INCOMING,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    record_audit_log(
        db,
        actor=current_user,
        action="work_order.forward.appointment",
        resource_type="work_order",
        resource_id=wo.id,
        summary=f"Forwarded appointment #{appt.id} into work order #{wo.id}",
        details={"appointment_id": appt.id},
    )
    db.commit()
    return wo
