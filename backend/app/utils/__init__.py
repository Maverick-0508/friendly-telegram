"""
Utility functions
"""
from app.utils.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_current_admin_user,
    authenticate_user,
)
from app.utils.email import (
    send_email,
    send_contact_form_notification,
    send_quote_confirmation,
    send_appointment_confirmation,
    send_welcome_email,
)
from app.utils.validators import (
    validate_phone_number,
    validate_postal_code,
    calculate_distance,
    is_in_service_area,
    validate_service_area,
    validate_property_size,
    sanitize_filename,
    validate_date_range,
)

__all__ = [
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "get_current_user",
    "get_current_admin_user",
    "authenticate_user",
    "send_email",
    "send_contact_form_notification",
    "send_quote_confirmation",
    "send_appointment_confirmation",
    "send_welcome_email",
    "validate_phone_number",
    "validate_postal_code",
    "calculate_distance",
    "is_in_service_area",
    "validate_service_area",
    "validate_property_size",
    "sanitize_filename",
    "validate_date_range",
]
