from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
import re

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI(title="Lawn Craft Contact API")


class ContactPayload(BaseModel):
    # Current frontend fields
    full_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    subject: Optional[str] = None
    service_type: Optional[str] = None
    message: str
    # Legacy compatibility
    name: Optional[str] = None
    service: Optional[str] = None


def _clean(value: Optional[str]) -> Optional[str]:
    return (value or "").strip() or None


def _validate_email(value: str) -> str:
    email = (value or "").strip()
    email_pattern = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
    if not email or not re.match(email_pattern, email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please provide a valid email address.",
        )
    return email


@app.post("")
@app.post("/")
def create_contact(payload: ContactPayload):
    full_name = _clean(payload.full_name) or _clean(payload.name)
    if not full_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Full name is required.",
        )

    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message is required.",
        )

    service_type = _clean(payload.service_type) or _clean(payload.service)
    subject = _clean(payload.subject)
    if not subject:
        subject = f"Website enquiry - {service_type}" if service_type else "Website enquiry"
    submission_id = str(uuid4())

    record = {
        "id": submission_id,
        "full_name": full_name,
        "email": _validate_email(payload.email),
        "phone": _clean(payload.phone),
        "subject": subject,
        "service_type": service_type,
        "message": message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "status": "success",
        "id": record["id"],
        "message": "Thank you! Your consultation request has been received.",
    }
