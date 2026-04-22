"""
Supervisor Dashboard router.

Provides focused views for the supervisor's daily workflow:

  GET /supervisor/queue          – incoming work orders awaiting review
  GET /supervisor/planning       – planned / reviewed jobs (upcoming)
  GET /supervisor/active         – today's in-progress jobs
  GET /supervisor/property/{addr} – full timeline for a specific property
  GET /supervisor/exceptions     – overdue, blocked, or missing-log jobs
  GET /supervisor/report         – KPI report (planned vs completed, labour, turnaround)
  GET /supervisor/stats          – aggregate counts dashboard card
"""
from typing import List
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.models.task_item import TaskItem, TaskItemStatus
from app.models.field_log import FieldLog
from app.models.issue_note import IssueNote
from app.models.user import User
from app.schemas.work_order import WorkOrderResponse
from app.utils.auth import get_current_supervisor_or_admin_user

router = APIRouter(prefix="/supervisor", tags=["Supervisor Dashboard"])


# ---------------------------------------------------------------------------
# Queue – new / unreviewed work orders
# ---------------------------------------------------------------------------

@router.get("/queue", response_model=List[WorkOrderResponse])
def get_queue(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Work orders in INCOMING status awaiting supervisor review.
    Ordered oldest-first so nothing falls through the cracks.
    """
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.status == WorkOrderStatus.INCOMING)
        .order_by(WorkOrder.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Planning Board – reviewed / planned jobs
# ---------------------------------------------------------------------------

@router.get("/planning", response_model=List[WorkOrderResponse])
def get_planning_board(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Work orders in REVIEWED or PLANNED status sorted by target date.
    """
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.status.in_([WorkOrderStatus.REVIEWED, WorkOrderStatus.PLANNED]))
        .order_by(WorkOrder.target_date.asc().nullslast(), WorkOrder.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Active Jobs – in-progress today
# ---------------------------------------------------------------------------

@router.get("/active", response_model=List[WorkOrderResponse])
def get_active_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Work orders currently IN_PROGRESS.
    """
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.status == WorkOrderStatus.IN_PROGRESS)
        .order_by(WorkOrder.started_at.asc().nullslast())
        .all()
    )


# ---------------------------------------------------------------------------
# Property History – full timeline per property address
# ---------------------------------------------------------------------------

@router.get("/property", response_model=List[WorkOrderResponse])
def get_property_history(
    address: str = Query(..., description="Property address to filter by (partial match supported)"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Full chronological list of work orders for a specific property (partial address match).
    """
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.property_address.ilike(f"%{address}%"))
        .order_by(WorkOrder.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Exceptions – overdue, blocked, or incomplete
# ---------------------------------------------------------------------------

@router.get("/exceptions")
def get_exceptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Returns work orders that need attention:
    - Overdue: target_date in the past and not yet completed/verified.
    - Blocked: have open HIGH-severity issue notes.
    - Missing logs: IN_PROGRESS or COMPLETED with no field log entries.
    """
    now = datetime.utcnow()

    # Overdue
    overdue = (
        db.query(WorkOrder)
        .filter(
            WorkOrder.target_date < now,
            WorkOrder.status.notin_([
                WorkOrderStatus.COMPLETED,
                WorkOrderStatus.VERIFIED,
                WorkOrderStatus.CANCELLED,
            ]),
        )
        .all()
    )

    # Work orders with unresolved high-severity issues
    from sqlalchemy import select as sa_select
    blocked_ids_sq = (
        sa_select(IssueNote.work_order_id)
        .where(
            IssueNote.is_resolved == False,
            IssueNote.severity == "high",
        )
        .distinct()
    )
    blocked = db.query(WorkOrder).filter(WorkOrder.id.in_(blocked_ids_sq)).all()

    # Work orders IN_PROGRESS/COMPLETED with no field log
    logged_ids_sq = sa_select(FieldLog.work_order_id).distinct()
    missing_logs = (
        db.query(WorkOrder)
        .filter(
            WorkOrder.status.in_([WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED]),
            WorkOrder.id.notin_(logged_ids_sq),
        )
        .all()
    )

    from app.schemas.work_order import WorkOrderResponse

    def _serialize(items):
        return [WorkOrderResponse.model_validate(i).model_dump() for i in items]

    return {
        "overdue": _serialize(overdue),
        "blocked": _serialize(blocked),
        "missing_field_logs": _serialize(missing_logs),
    }


# ---------------------------------------------------------------------------
# KPI Report
# ---------------------------------------------------------------------------

@router.get("/report")
def get_kpi_report(
    days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """
    Operational KPI report covering the last N days:
    - Planned vs completed tasks
    - Total and average labour hours per job
    - Turnaround time (created → completed)
    - Issue / rework rate
    """
    since = datetime.utcnow() - timedelta(days=days)

    # Work orders in window
    total_wo = db.query(WorkOrder).filter(WorkOrder.created_at >= since).count()
    completed_wo = (
        db.query(WorkOrder)
        .filter(
            WorkOrder.completed_at >= since,
            WorkOrder.status.in_([WorkOrderStatus.COMPLETED, WorkOrderStatus.VERIFIED]),
        )
        .count()
    )

    # Tasks planned vs done
    total_tasks = (
        db.query(TaskItem)
        .join(WorkOrder, TaskItem.work_order_id == WorkOrder.id)
        .filter(WorkOrder.created_at >= since)
        .count()
    )
    completed_tasks = (
        db.query(TaskItem)
        .join(WorkOrder, TaskItem.work_order_id == WorkOrder.id)
        .filter(
            WorkOrder.created_at >= since,
            TaskItem.status == TaskItemStatus.DONE,
        )
        .count()
    )

    # Labour hours
    labour_result = (
        db.query(func.sum(FieldLog.labor_hours), func.count(FieldLog.id))
        .join(WorkOrder, FieldLog.work_order_id == WorkOrder.id)
        .filter(WorkOrder.created_at >= since)
        .first()
    )
    total_labour_hours = float(labour_result[0] or 0)
    total_field_log_count = labour_result[1] or 0
    avg_labour_per_log = round(total_labour_hours / total_field_log_count, 2) if total_field_log_count else 0

    # Turnaround time (average days from created_at to completed_at)
    completed_records = (
        db.query(WorkOrder.created_at, WorkOrder.completed_at)
        .filter(
            WorkOrder.completed_at >= since,
            WorkOrder.status.in_([WorkOrderStatus.COMPLETED, WorkOrderStatus.VERIFIED]),
            WorkOrder.completed_at.isnot(None),
        )
        .all()
    )
    if completed_records:
        durations = [
            (r.completed_at - r.created_at).total_seconds() / 3600
            for r in completed_records
            if r.completed_at and r.created_at
        ]
        avg_turnaround_hours = round(sum(durations) / len(durations), 2) if durations else 0
    else:
        avg_turnaround_hours = 0

    # Issues logged
    total_issues = (
        db.query(IssueNote)
        .join(WorkOrder, IssueNote.work_order_id == WorkOrder.id)
        .filter(WorkOrder.created_at >= since)
        .count()
    )
    resolved_issues = (
        db.query(IssueNote)
        .join(WorkOrder, IssueNote.work_order_id == WorkOrder.id)
        .filter(
            WorkOrder.created_at >= since,
            IssueNote.is_resolved == True,
        )
        .count()
    )

    task_completion_rate = round((completed_tasks / total_tasks) * 100, 2) if total_tasks else 0
    issue_resolution_rate = round((resolved_issues / total_issues) * 100, 2) if total_issues else 0

    return {
        "period_days": days,
        "work_orders": {
            "total": total_wo,
            "completed": completed_wo,
        },
        "tasks": {
            "total_planned": total_tasks,
            "completed": completed_tasks,
            "completion_rate_pct": task_completion_rate,
        },
        "labour": {
            "total_hours": total_labour_hours,
            "avg_hours_per_log": avg_labour_per_log,
        },
        "turnaround": {
            "avg_hours_to_complete": avg_turnaround_hours,
        },
        "issues": {
            "total": total_issues,
            "resolved": resolved_issues,
            "resolution_rate_pct": issue_resolution_rate,
        },
    }


# ---------------------------------------------------------------------------
# Stats – summary card counts
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_supervisor_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Aggregate counts for the supervisor dashboard header cards."""
    counts = {}
    for s in WorkOrderStatus:
        counts[s.value] = db.query(WorkOrder).filter(WorkOrder.status == s).count()

    total_open_issues = db.query(IssueNote).filter(IssueNote.is_resolved == False).count()
    total_pending_tasks = db.query(TaskItem).filter(TaskItem.status == TaskItemStatus.PENDING).count()

    return {
        "work_orders_by_status": counts,
        "open_issues": total_open_issues,
        "pending_tasks": total_pending_tasks,
    }
