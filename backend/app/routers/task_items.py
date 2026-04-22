"""
Task Items router – manage checklist entries under a Work Order.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task_item import TaskItem, TaskItemStatus
from app.models.work_order import WorkOrder
from app.models.user import User
from app.schemas.task_item import TaskItemCreate, TaskItemUpdate, TaskItemResponse
from app.utils.auth import get_current_supervisor_or_admin_user

router = APIRouter(prefix="/task-items", tags=["Task Items"])


def _get_work_order_or_404(work_order_id: int, db: Session) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    return wo


@router.post("", response_model=TaskItemResponse, status_code=status.HTTP_201_CREATED)
def create_task_item(
    data: TaskItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Add a task item to a work order (supervisor/admin only)"""
    _get_work_order_or_404(data.work_order_id, db)
    item = TaskItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/work-order/{work_order_id}", response_model=List[TaskItemResponse])
def list_task_items(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """List all task items for a work order (supervisor/admin only)"""
    _get_work_order_or_404(work_order_id, db)
    return (
        db.query(TaskItem)
        .filter(TaskItem.work_order_id == work_order_id)
        .order_by(TaskItem.created_at)
        .all()
    )


@router.get("/{task_item_id}", response_model=TaskItemResponse)
def get_task_item(
    task_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Get a specific task item (supervisor/admin only)"""
    item = db.query(TaskItem).filter(TaskItem.id == task_item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task item not found")
    return item


@router.put("/{task_item_id}", response_model=TaskItemResponse)
def update_task_item(
    task_item_id: int,
    data: TaskItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Update a task item (supervisor/admin only)"""
    item = db.query(TaskItem).filter(TaskItem.id == task_item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task item not found")

    update_data = data.model_dump(exclude_unset=True)

    if "status" in update_data and update_data["status"] == TaskItemStatus.DONE and not item.completed_at:
        item.completed_at = datetime.utcnow()

    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{task_item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_item(
    task_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Delete a task item (supervisor/admin only)"""
    item = db.query(TaskItem).filter(TaskItem.id == task_item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task item not found")
    db.delete(item)
    db.commit()
    return None
