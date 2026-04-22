"""
Resource Plans router – manage planned crew and equipment for a Work Order.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.resource_plan import ResourcePlan
from app.models.work_order import WorkOrder
from app.models.user import User
from app.schemas.resource_plan import ResourcePlanCreate, ResourcePlanUpdate, ResourcePlanResponse
from app.utils.auth import get_current_supervisor_or_admin_user

router = APIRouter(prefix="/resource-plans", tags=["Resource Plans"])


def _get_work_order_or_404(work_order_id: int, db: Session) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    return wo


@router.post("", response_model=ResourcePlanResponse, status_code=status.HTTP_201_CREATED)
def create_resource_plan(
    data: ResourcePlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Create a resource plan for a work order (supervisor/admin only)"""
    _get_work_order_or_404(data.work_order_id, db)
    plan = ResourcePlan(**data.model_dump(), created_by_id=current_user.id)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/work-order/{work_order_id}", response_model=List[ResourcePlanResponse])
def list_resource_plans(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """List all resource plans for a work order (supervisor/admin only)"""
    _get_work_order_or_404(work_order_id, db)
    return (
        db.query(ResourcePlan)
        .filter(ResourcePlan.work_order_id == work_order_id)
        .order_by(ResourcePlan.created_at)
        .all()
    )


@router.get("/{resource_plan_id}", response_model=ResourcePlanResponse)
def get_resource_plan(
    resource_plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Get a specific resource plan (supervisor/admin only)"""
    plan = db.query(ResourcePlan).filter(ResourcePlan.id == resource_plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource plan not found")
    return plan


@router.put("/{resource_plan_id}", response_model=ResourcePlanResponse)
def update_resource_plan(
    resource_plan_id: int,
    data: ResourcePlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Update a resource plan (supervisor/admin only)"""
    plan = db.query(ResourcePlan).filter(ResourcePlan.id == resource_plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource plan not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{resource_plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource_plan(
    resource_plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Delete a resource plan (supervisor/admin only)"""
    plan = db.query(ResourcePlan).filter(ResourcePlan.id == resource_plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource plan not found")
    db.delete(plan)
    db.commit()
    return None
