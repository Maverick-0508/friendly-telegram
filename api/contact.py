from datetime import datetime, timezone
from typing import Optional

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


submissions: list[dict] = []


def _clean(value: Optional[str]) -> Optional[str]:
    return (value or "").strip() or None


def _validate_email(value: str) -> str:
    email = (value or "").strip()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
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

    record = {
        "id": len(submissions) + 1,
        "full_name": full_name,
        "email": _validate_email(payload.email),
        "phone": _clean(payload.phone),
        "subject": _clean(payload.subject) or (f"Website enquiry - {service_type}" if service_type else "Website enquiry"),
        "service_type": service_type,
        "message": message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    submissions.append(record)

    return {
        "status": "success",
        "id": record["id"],
        "message": "Thank you! Your consultation request has been received.",
    }
