"""
Helpers for audit logging and admin control-center policy checks.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.permission_policy import PermissionPolicy
from app.models.user import User, UserRole
from app.models.user_access_profile import UserAccessProfile


def _normalize_csv(value: str) -> set[str]:
    return {item.strip().lower() for item in (value or '').split(',') if item.strip()}


def get_user_department(db: Session, user: User) -> str:
    profile = db.query(UserAccessProfile).filter(UserAccessProfile.user_id == user.id).first()
    return (profile.department if profile and profile.department else 'general').lower()


def record_audit_log(
    db: Session,
    *,
    actor: User | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | int | None = None,
    summary: str | None = None,
    details: Any | None = None,
) -> AuditLog:
    log = AuditLog(
        actor_user_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        summary=summary,
        details_json=json.dumps(details, default=str) if details is not None else None,
    )
    db.add(log)
    db.flush()
    return log


def ensure_permission_policy(db: Session, feature_key: str, label: str, description: str = '') -> PermissionPolicy:
    policy = db.query(PermissionPolicy).filter(PermissionPolicy.feature_key == feature_key).first()
    if policy:
        return policy

    policy = PermissionPolicy(
        feature_key=feature_key,
        label=label,
        description=description,
        allowed_roles='admin,supervisor',
        allowed_departments='',
        is_enabled=True,
    )
    db.add(policy)
    db.flush()
    return policy


def is_feature_allowed(db: Session, user: User, feature_key: str) -> bool:
    if user.role == UserRole.ADMIN:
        return True

    policy = db.query(PermissionPolicy).filter(PermissionPolicy.feature_key == feature_key).first()
    if not policy or not policy.is_enabled:
        return user.role == UserRole.SUPERVISOR

    allowed_roles = _normalize_csv(policy.allowed_roles)
    allowed_departments = _normalize_csv(policy.allowed_departments)

    if allowed_roles and user.role.value.lower() not in allowed_roles:
        return False

    if allowed_departments:
        department = get_user_department(db, user)
        return department in allowed_departments

    return True


def require_feature_access(db: Session, user: User, feature_key: str) -> None:
    if not is_feature_allowed(db, user, feature_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access to {feature_key.replace('_', ' ')} is restricted by policy.",
        )