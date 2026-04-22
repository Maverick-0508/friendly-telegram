"""
Field Logs router – record what was actually done on-site for a Work Order.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.field_log import FieldLog
from app.models.work_order import WorkOrder
from app.models.user import User
from app.schemas.field_log import FieldLogCreate, FieldLogUpdate, FieldLogResponse
from app.utils.auth import get_current_supervisor_or_admin_user

router = APIRouter(prefix="/field-logs", tags=["Field Logs"])


def _get_work_order_or_404(work_order_id: int, db: Session) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    return wo


@router.post("", response_model=FieldLogResponse, status_code=status.HTTP_201_CREATED)
def create_field_log(
    data: FieldLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Add a field log entry for a work order (supervisor/admin only)"""
    _get_work_order_or_404(data.work_order_id, db)
    log = FieldLog(**data.model_dump(), logged_by_id=current_user.id)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/work-order/{work_order_id}", response_model=List[FieldLogResponse])
def list_field_logs(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """List all field logs for a work order (supervisor/admin only)"""
    _get_work_order_or_404(work_order_id, db)
    return (
        db.query(FieldLog)
        .filter(FieldLog.work_order_id == work_order_id)
        .order_by(FieldLog.created_at)
        .all()
    )


@router.get("/{field_log_id}", response_model=FieldLogResponse)
def get_field_log(
    field_log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Get a specific field log (supervisor/admin only)"""
    log = db.query(FieldLog).filter(FieldLog.id == field_log_id).first()
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field log not found")
    return log


@router.put("/{field_log_id}", response_model=FieldLogResponse)
def update_field_log(
    field_log_id: int,
    data: FieldLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Update a field log (supervisor/admin only)"""
    log = db.query(FieldLog).filter(FieldLog.id == field_log_id).first()
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field log not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)

    db.commit()
    db.refresh(log)
    return log


@router.delete("/{field_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field_log(
    field_log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Delete a field log (supervisor/admin only)"""
    log = db.query(FieldLog).filter(FieldLog.id == field_log_id).first()
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field log not found")
    db.delete(log)
    db.commit()
    return None
