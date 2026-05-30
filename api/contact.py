from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from typing import Optional
from uuid import uuid4
import json
import os
import re
import fcntl
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_BODY_BYTES = 1_048_576  # 1 MB
DEFAULT_EMPTY_PAYLOAD = b"{}"
MAX_BACKEND_ERROR_BYTES = 8192
BACKEND_TIMEOUT_SECONDS = 12
DEFAULT_FALLBACK_STORAGE_PATH = "/tmp/contact-submissions.jsonl"
BACKEND_URL_ENV_KEYS = (
    "CONTACT_BACKEND_API_URL",
    "AUTOMATIC_SPOON_API_URL",
    "AUTOMATIC_SPOON_BACKEND_URL",
    "BACKEND_API_BASE_URL",
    "BACKEND_API_URL",
    "DASHBOARD_API_BASE",
    "LAWNCRAFT_API_BASE",
)
LOGGER = logging.getLogger(__name__)


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


def _resolve_backend_contact_url() -> Optional[str]:
    for key in BACKEND_URL_ENV_KEYS:
        raw = os.getenv(key, "").strip()
        if not raw:
            continue

        normalized = raw.rstrip("/")
        # Host-only values (e.g. "api.example.com") are normalized to HTTPS.
        # Path-like values (e.g. "/api") stay unchanged and are rejected later.
        if not urlparse(normalized).scheme and not normalized.startswith("/"):
            normalized = f"https://{normalized}"
        if normalized.endswith("/contact"):
            return normalized
        if normalized.endswith("/api"):
            return f"{normalized}/contact"
        return f"{normalized}/api/contact"
    return None


def _is_valid_backend_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _extract_error_detail(error_body: bytes) -> str:
    if not error_body:
        return "Contact request could not be delivered to backend."
    try:
        parsed = json.loads(error_body.decode("utf-8"))
        detail = parsed.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail
    except Exception:
        pass
    return "Contact request could not be delivered to backend."


def _normalize_backend_response(status_code: int, backend_response):
    if isinstance(backend_response, dict):
        return status_code, backend_response
    return 502, {"detail": "Invalid response from contact backend."}


def _fallback_success_response(payload: dict):
    return {
        "status": "success",
        "message": "Thank you! Your consultation request has been received.",
        "id": payload.get("id"),
    }


def _resolve_fallback_storage_path() -> str:
    return (os.getenv("CONTACT_FALLBACK_STORAGE_PATH") or DEFAULT_FALLBACK_STORAGE_PATH).strip()


def _is_safe_fallback_storage_path(path: str) -> bool:
    if os.path.islink(path):
        return False
    resolved = os.path.realpath(path)
    tmp_root = os.path.realpath("/tmp")
    try:
        return os.path.commonpath([resolved, tmp_root]) == tmp_root and resolved != tmp_root
    except ValueError:
        return False


def _persist_contact_submission(record: dict):
    """Persist a validated contact record to local fallback storage."""
    storage_path = _resolve_fallback_storage_path()
    if not _is_safe_fallback_storage_path(storage_path):
        return False

    try:
        fd = os.open(storage_path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            fh.flush()
        return True
    except OSError as exc:
        LOGGER.warning("contact fallback persistence failed: %s", exc)
        return False


def _forward_contact_to_backend(payload: dict):
    if not isinstance(payload, dict):
        return 400, {"detail": "Invalid contact payload."}

    backend_url = _resolve_backend_contact_url()
    if not backend_url:
        if _persist_contact_submission(payload):
            return 202, _fallback_success_response(payload)
        return 503, {
            "detail": "Contact backend is unavailable and fallback storage failed. Please try again.",
        }
    if not _is_valid_backend_url(backend_url):
        if _persist_contact_submission(payload):
            return 202, _fallback_success_response(payload)
        return 503, {
            "detail": "Contact backend URL configuration is invalid and fallback storage failed.",
        }

    try:
        request_data = json.dumps(payload).encode("utf-8")
        request = Request(
            backend_url,
            data=request_data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        with urlopen(request, timeout=BACKEND_TIMEOUT_SECONDS) as response:
            status_code = getattr(response, "status", None)
            status_code = status_code if status_code is not None else 200
            body = response.read()
            if body == b"":
                body = b"{}"
            try:
                parsed = json.loads(body.decode("utf-8"))
                if isinstance(parsed, dict):
                    return status_code, parsed
            except Exception:
                pass
            return status_code, {
                "status": "success",
                "message": "Thank you! Your consultation request has been received.",
            }
    except HTTPError as exc:
        error_body = exc.read(MAX_BACKEND_ERROR_BYTES)
        return exc.code, {"detail": _extract_error_detail(error_body)}
    except ValueError:
        return 503, {
            "detail": "Contact backend URL format is invalid and cannot be used to create a request.",
        }
    except (TimeoutError, URLError, OSError):
        if _persist_contact_submission(payload):
            return 202, _fallback_success_response(payload)
        return 503, {"detail": "Contact backend is temporarily unavailable. Please try again."}


class ContactHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, body: dict):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send_json(400, {"detail": "Invalid Content-Length header."})
            return

        if content_length < 0:
            self._send_json(400, {"detail": "Invalid Content-Length header."})
            return

        if content_length > MAX_BODY_BYTES:
            self._send_json(413, {"detail": "Payload too large."})
            return
        try:
            raw = self.rfile.read(content_length) if content_length > 0 else DEFAULT_EMPTY_PAYLOAD
        except OSError:
            self._send_json(408, {"detail": "Request body could not be read. Please try again."})
            return
        try:
            decoded = raw.decode("utf-8")
        except UnicodeDecodeError:
            self._send_json(400, {"detail": "Request body must be UTF-8 encoded JSON."})
            return
        try:
            payload = json.loads(decoded)
            if not isinstance(payload, dict):
                raise ValueError
        except ValueError:
            self._send_json(400, {"detail": "Request body must be valid JSON."})
            return

        record, error = _build_contact_record(payload)
        if error:
            self._send_json(422, {"detail": error})
            return

        status_code, backend_response = _forward_contact_to_backend(record)
        status_code, backend_response = _normalize_backend_response(status_code, backend_response)
        self._send_json(status_code, backend_response)


# Vercel Python runtime entrypoint
handler = ContactHandler
