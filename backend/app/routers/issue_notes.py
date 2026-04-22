"""
Issue Notes router – track blockers, access issues, weather delays, etc.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.issue_note import IssueNote
from app.models.work_order import WorkOrder
from app.models.user import User
from app.schemas.issue_note import IssueNoteCreate, IssueNoteUpdate, IssueNoteResponse
from app.utils.auth import get_current_supervisor_or_admin_user

router = APIRouter(prefix="/issue-notes", tags=["Issue Notes"])


def _get_work_order_or_404(work_order_id: int, db: Session) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    return wo


@router.post("", response_model=IssueNoteResponse, status_code=status.HTTP_201_CREATED)
def create_issue_note(
    data: IssueNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Add an issue note to a work order (supervisor/admin only)"""
    _get_work_order_or_404(data.work_order_id, db)
    note = IssueNote(**data.model_dump(), logged_by_id=current_user.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/work-order/{work_order_id}", response_model=List[IssueNoteResponse])
def list_issue_notes(
    work_order_id: int,
    unresolved_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """List all issue notes for a work order (supervisor/admin only)"""
    _get_work_order_or_404(work_order_id, db)
    query = db.query(IssueNote).filter(IssueNote.work_order_id == work_order_id)
    if unresolved_only:
        query = query.filter(IssueNote.is_resolved == False)
    return query.order_by(IssueNote.created_at).all()


@router.get("/{issue_note_id}", response_model=IssueNoteResponse)
def get_issue_note(
    issue_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Get a specific issue note (supervisor/admin only)"""
    note = db.query(IssueNote).filter(IssueNote.id == issue_note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue note not found")
    return note


@router.put("/{issue_note_id}", response_model=IssueNoteResponse)
def update_issue_note(
    issue_note_id: int,
    data: IssueNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Update an issue note (supervisor/admin only)"""
    note = db.query(IssueNote).filter(IssueNote.id == issue_note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue note not found")

    update_data = data.model_dump(exclude_unset=True)

    # Auto-stamp resolution time when resolved is first set to True
    if update_data.get("is_resolved") and not note.is_resolved:
        note.resolved_at = datetime.utcnow()

    for field, value in update_data.items():
        setattr(note, field, value)

    db.commit()
    db.refresh(note)
    return note


@router.delete("/{issue_note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue_note(
    issue_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_supervisor_or_admin_user),
):
    """Delete an issue note (supervisor/admin only)"""
    note = db.query(IssueNote).filter(IssueNote.id == issue_note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue note not found")
    db.delete(note)
    db.commit()
    return None
