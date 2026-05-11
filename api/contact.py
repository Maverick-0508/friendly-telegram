from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from typing import Optional
from uuid import uuid4
import json
import re

def _clean(value: Optional[str]) -> Optional[str]:
    return (value or "").strip() or None


def _validate_email(value: Optional[str]) -> Optional[str]:
    email = (value or "").strip()
    email_pattern = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
    if not email or not re.match(email_pattern, email):
        return None
    return email


def _build_contact_record(payload: dict):
    full_name = _clean(payload.get("full_name")) or _clean(payload.get("name"))
    if not full_name:
        return None, "Full name is required."

    message = _clean(payload.get("message"))
    if not message:
        return None, "Message is required."

    email = _validate_email(payload.get("email"))
    if not email:
        return None, "Please provide a valid email address."

    service_type = _clean(payload.get("service_type")) or _clean(payload.get("service"))
    subject = _clean(payload.get("subject"))
    if not subject:
        subject = f"Website enquiry - {service_type}" if service_type else "Website enquiry"

    return {
        "id": str(uuid4()),
        "full_name": full_name,
        "email": email,
        "phone": _clean(payload.get("phone")),
        "subject": subject,
        "service_type": service_type,
        "message": message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, None


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, body: dict):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
        except ValueError:
            self._send_json(400, {"detail": "Request body must be valid JSON."})
            return

        record, error = _build_contact_record(payload)
        if error:
            self._send_json(422, {"detail": error})
            return

        self._send_json(
            201,
            {
                "status": "success",
                "id": record["id"],
                "message": "Thank you! Your consultation request has been received.",
            },
        )
