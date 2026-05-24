import json
from urllib.error import URLError

import api.contact as contact_api


class _FakeResponse:
    def __init__(self, status=201, body=None):
        self.status = status
        self._body = body or b'{"id": 123, "status": "success"}'

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_resolve_backend_contact_url_prefers_explicit_contact_url(monkeypatch):
    monkeypatch.setenv("CONTACT_BACKEND_API_URL", "https://api.example.com/contact")
    assert contact_api._resolve_backend_contact_url() == "https://api.example.com/contact"


def test_resolve_backend_contact_url_appends_api_contact(monkeypatch):
    monkeypatch.delenv("CONTACT_BACKEND_API_URL", raising=False)
    monkeypatch.setenv("BACKEND_API_BASE_URL", "https://api.example.com")
    assert contact_api._resolve_backend_contact_url() == "https://api.example.com/api/contact"


def test_resolve_backend_contact_url_adds_https_scheme(monkeypatch):
    monkeypatch.delenv("CONTACT_BACKEND_API_URL", raising=False)
    monkeypatch.setenv("BACKEND_API_BASE_URL", "api.example.com")
    assert contact_api._resolve_backend_contact_url() == "https://api.example.com/api/contact"


def test_forward_contact_to_backend_posts_payload(monkeypatch):
    monkeypatch.setenv("CONTACT_BACKEND_API_URL", "https://api.example.com/api")
    captured = {}

    def _fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return _FakeResponse()

    monkeypatch.setattr(contact_api, "urlopen", _fake_urlopen)
    status_code, payload = contact_api._forward_contact_to_backend({"full_name": "A", "email": "a@x.com", "message": "Hi"})

    assert status_code == 201
    assert payload["status"] == "success"
    assert captured["url"] == "https://api.example.com/api/contact"
    assert captured["timeout"] == contact_api.BACKEND_TIMEOUT_SECONDS
    assert captured["payload"]["full_name"] == "A"


def test_normalize_backend_response_accepts_dict_payload():
    status_code, payload = contact_api._normalize_backend_response(201, {"status": "success"})
    assert status_code == 201
    assert payload["status"] == "success"


def test_normalize_backend_response_rejects_non_dict_payload():
    status_code, payload = contact_api._normalize_backend_response(201, "ok")
    assert status_code == 502
    assert payload["detail"] == "Invalid response from contact backend."


def test_forward_contact_to_backend_rejects_invalid_url(monkeypatch):
    monkeypatch.setenv("CONTACT_BACKEND_API_URL", "/api")
    status_code, payload = contact_api._forward_contact_to_backend(
        {"full_name": "A", "email": "a@x.com", "message": "Hi"}
    )
    assert status_code == 202
    assert payload["status"] == "success"


def test_forward_contact_to_backend_uses_fallback_when_unconfigured(monkeypatch, tmp_path):
    monkeypatch.delenv("CONTACT_BACKEND_API_URL", raising=False)
    monkeypatch.delenv("BACKEND_API_BASE_URL", raising=False)
    monkeypatch.delenv("BACKEND_API_URL", raising=False)
    monkeypatch.delenv("DASHBOARD_API_BASE", raising=False)
    monkeypatch.delenv("LAWNCRAFT_API_BASE", raising=False)
    monkeypatch.setenv("CONTACT_FALLBACK_STORAGE_PATH", str(tmp_path / "contact-submissions.jsonl"))

    submission = {"id": "submission-1", "full_name": "A", "email": "a@x.com", "message": "Hi"}
    status_code, payload = contact_api._forward_contact_to_backend(submission)

    assert status_code == 202
    assert payload["status"] == "success"
    assert payload["id"] == "submission-1"
    stored_lines = (tmp_path / "contact-submissions.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(stored_lines) == 1
    assert json.loads(stored_lines[0])["id"] == submission["id"]


def test_forward_contact_to_backend_uses_fallback_when_unavailable(monkeypatch, tmp_path):
    monkeypatch.setenv("CONTACT_BACKEND_API_URL", "https://api.example.com/api")
    monkeypatch.setenv("CONTACT_FALLBACK_STORAGE_PATH", str(tmp_path / "contact-submissions.jsonl"))

    def _simulate_network_error(*args, **kwargs):
        raise URLError("unavailable")

    monkeypatch.setattr(contact_api, "urlopen", _simulate_network_error)
    submission = {"id": "submission-2", "full_name": "A", "email": "a@x.com", "message": "Hi"}
    status_code, payload = contact_api._forward_contact_to_backend(submission)

    assert status_code == 202
    assert payload["status"] == "success"
    assert payload["id"] == "submission-2"
    stored_lines = (tmp_path / "contact-submissions.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(stored_lines) == 1
    assert json.loads(stored_lines[0])["id"] == submission["id"]
