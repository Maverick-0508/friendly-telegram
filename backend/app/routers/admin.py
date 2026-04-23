"""
Admin router for dashboard statistics and management.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.contact import Contact
from app.models.permission_policy import PermissionPolicy
from app.models.quote import Quote, QuoteStatus
from app.models.system_setting import SystemSetting
from app.models.testimonial import Testimonial
from app.models.user import User, UserRole
from app.models.user_access_profile import UserAccessProfile
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.schemas.audit_log import AuditLogResponse
from app.schemas.permission_policy import PermissionPolicyResponse, PermissionPolicyUpdate
from app.schemas.system_setting import SystemSettingResponse, SystemSettingUpdate
from app.schemas.user_access_profile import UserAccessProfileResponse, UserAccessProfileUpdate
from app.utils.audit import record_audit_log, require_feature_access
from app.utils.auth import get_current_admin_user

router = APIRouter(prefix="/admin", tags=["Admin"])


DEFAULT_SYSTEM_SETTINGS = [
    {
        "setting_key": "contact_intake_enabled",
        "label": "Contact Intake",
        "group_name": "Operations",
        "value": "true",
        "description": "Allow website contact submissions to enter the supervisor queue.",
        "is_sensitive": False,
    },
    {
        "setting_key": "dashboard_auto_refresh_seconds",
        "label": "Dashboard Auto-Refresh",
        "group_name": "Monitoring",
        "value": "60",
        "description": "Automatic refresh cadence for live dashboard views.",
        "is_sensitive": False,
    },
    {
        "setting_key": "finance_reports_scope",
        "label": "Finance Reports Scope",
        "group_name": "Permissions",
        "value": "executive,finance",
        "description": "Departments allowed to access financial reports.",
        "is_sensitive": False,
    },
    {
        "setting_key": "notification_provider",
        "label": "Notification Provider",
        "group_name": "Integrations",
        "value": "smtp",
        "description": "Primary outbound notification integration.",
        "is_sensitive": False,
    },
]

DEFAULT_PERMISSION_POLICIES = [
    {
        "feature_key": "financial_reports",
        "label": "Financial Reports",
        "description": "Restrict financial reporting to specified departments.",
        "allowed_roles": "admin,supervisor",
        "allowed_departments": "executive,finance",
        "is_enabled": True,
    },
    {
        "feature_key": "audit_logs",
        "label": "Audit Logs",
        "description": "View and search transparent action logs.",
        "allowed_roles": "admin",
        "allowed_departments": "executive,compliance",
        "is_enabled": True,
    },
    {
        "feature_key": "settings_hub",
        "label": "Configuration Hub",
        "description": "Edit grouped system settings and integration values.",
        "allowed_roles": "admin",
        "allowed_departments": "executive,it,operations",
        "is_enabled": True,
    },
]


def _seed_admin_controls(db: Session) -> None:
    for setting in DEFAULT_SYSTEM_SETTINGS:
        row = db.query(SystemSetting).filter(SystemSetting.setting_key == setting["setting_key"]).first()
        if not row:
            db.add(SystemSetting(**setting))

    for policy in DEFAULT_PERMISSION_POLICIES:
        existing = db.query(PermissionPolicy).filter(PermissionPolicy.feature_key == policy["feature_key"]).first()
        if not existing:
            db.add(PermissionPolicy(**policy))

    db.flush()


def _dashboard_stats(db: Session) -> dict:
    total_quotes = db.query(Quote).count()
    total_appointments = db.query(Appointment).count()
    total_contacts = db.query(Contact).count()
    total_testimonials = db.query(Testimonial).filter(Testimonial.is_approved == True).count()
    total_users = db.query(User).count()

    pending_quotes = db.query(Quote).filter(Quote.status == QuoteStatus.PENDING).count()
    pending_testimonials = db.query(Testimonial).filter(Testimonial.is_approved == False).count()
    unread_contacts = db.query(Contact).filter(Contact.is_read == False).count()

    scheduled_appointments = db.query(Appointment).filter(Appointment.status == AppointmentStatus.SCHEDULED).count()
    confirmed_appointments = db.query(Appointment).filter(Appointment.status == AppointmentStatus.CONFIRMED).count()
    completed_appointments = db.query(Appointment).filter(Appointment.status == AppointmentStatus.COMPLETED).count()

    quotes_by_status = db.query(
        Quote.status,
        func.count(Quote.id).label("count"),
    ).group_by(Quote.status).all()

    quotes_status_breakdown = {status.value: 0 for status in QuoteStatus}
    for status_value, count in quotes_by_status:
        quotes_status_breakdown[status_value.value] = count

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_quotes = db.query(Quote).filter(Quote.created_at >= thirty_days_ago).count()
    recent_appointments = db.query(Appointment).filter(Appointment.created_at >= thirty_days_ago).count()
    recent_contacts = db.query(Contact).filter(Contact.created_at >= thirty_days_ago).count()

    conversion_rate = 0
    if total_quotes > 0:
        accepted_quotes = db.query(Quote).filter(Quote.status == QuoteStatus.ACCEPTED).count()
        conversion_rate = round((accepted_quotes / total_quotes) * 100, 2)

    avg_rating = db.query(func.avg(Testimonial.rating)).filter(Testimonial.is_approved == True).scalar() or 0
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
        },
    }


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Get dashboard statistics (admin only)."""
    return _dashboard_stats(db)


@router.get("/control-center")
def get_control_center(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """Return the combined admin control center data set."""
    _seed_admin_controls(db)

    monitoring = {
        "queue_count": db.query(WorkOrder).filter(WorkOrder.status == WorkOrderStatus.INCOMING).count(),
        "planning_count": db.query(WorkOrder).filter(WorkOrder.status == WorkOrderStatus.PLANNED).count(),
        "active_count": db.query(WorkOrder).filter(WorkOrder.status == WorkOrderStatus.IN_PROGRESS).count(),
        "open_contacts": db.query(Contact).filter(Contact.is_read == False).count(),
        "open_quotes": db.query(Quote).filter(Quote.status == QuoteStatus.PENDING).count(),
        "active_alerts": db.query(WorkOrder).filter(
            WorkOrder.status.in_([WorkOrderStatus.INCOMING, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED])
        ).count(),
        "generated_at": datetime.utcnow(),
    }

    permissions = db.query(PermissionPolicy).order_by(PermissionPolicy.feature_key.asc()).all()
    settings_rows = db.query(SystemSetting).order_by(SystemSetting.group_name.asc(), SystemSetting.label.asc()).all()
    recent_logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(25).all()
    access_profiles = db.query(UserAccessProfile).order_by(UserAccessProfile.department.asc()).all()

    return {
        "stats": _dashboard_stats(db),
        "monitoring": monitoring,
        "permissions": [
            {
                "id": policy.id,
                "feature_key": policy.feature_key,
                "label": policy.label,
                "description": policy.description,
                "allowed_roles": policy.allowed_roles,
                "allowed_departments": policy.allowed_departments,
                "is_enabled": policy.is_enabled,
            }
            for policy in permissions
        ],
        "settings": [
            {
                "id": setting.id,
                "setting_key": setting.setting_key,
                "label": setting.label,
                "group_name": setting.group_name,
                "value": setting.value if not setting.is_sensitive else "***",
                "description": setting.description,
                "is_sensitive": setting.is_sensitive,
                "updated_by_user_id": setting.updated_by_user_id,
                "updated_at": setting.updated_at,
            }
            for setting in settings_rows
        ],
        "audit_logs": [
            {
                "id": log.id,
                "actor_user_id": log.actor_user_id,
                "actor_email": log.actor_email,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "summary": log.summary,
                "details_json": log.details_json,
                "created_at": log.created_at,
            }
            for log in recent_logs
        ],
        "access_profiles": [
            {
                "id": profile.id,
                "user_id": profile.user_id,
                "department": profile.department,
                "cost_center": profile.cost_center,
                "notes": profile.notes,
                "created_at": profile.created_at,
                "updated_at": profile.updated_at,
            }
            for profile in access_profiles
        ],
    }


@router.get("/audit-logs", response_model=List[AuditLogResponse])
def list_audit_logs(
    q: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    query = db.query(AuditLog)
    if q:
        like_term = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(AuditLog.summary).like(like_term),
                func.lower(AuditLog.action).like(like_term),
                func.lower(AuditLog.actor_email).like(like_term),
            )
        )
    if action:
        query = query.filter(AuditLog.action == action)
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()


@router.get("/settings", response_model=List[SystemSettingResponse])
def list_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _seed_admin_controls(db)
    return db.query(SystemSetting).order_by(SystemSetting.group_name.asc(), SystemSetting.label.asc()).all()


@router.put("/settings/{setting_key}", response_model=SystemSettingResponse)
def update_system_setting(
    setting_key: str,
    payload: SystemSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _seed_admin_controls(db)
    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == setting_key).first()
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System setting not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(setting, field, value)
    setting.updated_by_user_id = current_user.id

    record_audit_log(
        db,
        actor=current_user,
        action="settings.update",
        resource_type="system_setting",
        resource_id=setting.setting_key,
        summary=f"Updated setting {setting.setting_key}",
        details=update_data,
    )
    db.commit()
    db.refresh(setting)
    return setting


@router.get("/permissions", response_model=List[PermissionPolicyResponse])
def list_permission_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _seed_admin_controls(db)
    return db.query(PermissionPolicy).order_by(PermissionPolicy.feature_key.asc()).all()


@router.put("/permissions/{feature_key}", response_model=PermissionPolicyResponse)
def update_permission_policy(
    feature_key: str,
    payload: PermissionPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _seed_admin_controls(db)
    policy = db.query(PermissionPolicy).filter(PermissionPolicy.feature_key == feature_key).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission policy not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(policy, field, value)

    record_audit_log(
        db,
        actor=current_user,
        action="permissions.update",
        resource_type="permission_policy",
        resource_id=policy.feature_key,
        summary=f"Updated access policy for {policy.feature_key}",
        details=update_data,
    )
    db.commit()
    db.refresh(policy)
    return policy


@router.get("/users/access-profiles", response_model=List[UserAccessProfileResponse])
def list_access_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return db.query(UserAccessProfile).order_by(UserAccessProfile.department.asc()).all()


@router.get("/users")
def list_users_with_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    users = db.query(User).order_by(User.full_name.asc()).all()
    profiles = {
        profile.user_id: profile
        for profile in db.query(UserAccessProfile).all()
    }

    return [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if user.role else None,
            "department": profiles.get(user.id).department if profiles.get(user.id) else None,
            "cost_center": profiles.get(user.id).cost_center if profiles.get(user.id) else None,
            "notes": profiles.get(user.id).notes if profiles.get(user.id) else None,
        }
        for user in users
    ]


@router.put("/users/{user_id}/access-profile", response_model=UserAccessProfileResponse)
def update_access_profile(
    user_id: int,
    payload: UserAccessProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = db.query(UserAccessProfile).filter(UserAccessProfile.user_id == user_id).first()
    if not profile:
        profile = UserAccessProfile(user_id=user_id, department=payload.department or "general")
        db.add(profile)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    record_audit_log(
        db,
        actor=current_user,
        action="permissions.assign_department",
        resource_type="user_access_profile",
        resource_id=user_id,
        summary=f"Assigned department profile to {user.email}",
        details=update_data,
    )
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/monitoring")
def get_monitoring_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    control_center = get_control_center(db=db, current_user=current_user)
    return {
        "monitoring": control_center["monitoring"],
        "alerts": {
            "queue": control_center["monitoring"]["queue_count"],
            "planning": control_center["monitoring"]["planning_count"],
            "active": control_center["monitoring"]["active_count"],
        },
    }


@router.get("/financial-summary")
def get_financial_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    require_feature_access(db, current_user, "financial_reports")
    total_quotes = db.query(Quote).count()
    accepted_quotes = db.query(Quote).filter(Quote.status == QuoteStatus.ACCEPTED).count()
    pending_quotes = db.query(Quote).filter(Quote.status == QuoteStatus.PENDING).count()
    conversion_rate = round((accepted_quotes / total_quotes) * 100, 2) if total_quotes else 0

    return {
        "total_quotes": total_quotes,
        "accepted_quotes": accepted_quotes,
        "pending_quotes": pending_quotes,
        "conversion_rate": conversion_rate,
        "appointments": db.query(Appointment).count(),
        "contacts": db.query(Contact).count(),
    }


@router.get("/service-area/check")
def check_service_area(
    latitude: float,
    longitude: float,
    db: Session = Depends(get_db),
):
    """Check if a location is within the service area."""
    from app.utils.validators import validate_service_area

    result = validate_service_area(latitude, longitude)
    return result


@router.post("/service-area/check")
def check_service_area_post(
    data: dict,
    db: Session = Depends(get_db),
):
    """Check if a location is within the service area (POST version)."""
    from app.utils.validators import validate_service_area

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Latitude and longitude are required",
        )

    result = validate_service_area(latitude, longitude)
    return result
