"""
Tests for the /api/auth endpoints:
  POST /register
  POST /login  (form-encoded)
  POST /login/json
  GET  /me
  POST /refresh
"""
import pytest
from fastapi.testclient import TestClient

from tests.conftest import CUSTOMER_EMAIL, CUSTOMER_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def test_register_new_user_returns_201(client):
    payload = {
        "email": "new@example.com",
        "password": "SecurePass1!",
        "full_name": "New User",
        "phone": "+1 2345678901",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new@example.com"
    assert data["full_name"] == "New User"
    assert "id" in data
    assert "hashed_password" not in data


def test_register_duplicate_email_returns_400(client, customer_user):
    payload = {
        "email": CUSTOMER_EMAIL,
        "password": "AnotherPass1!",
        "full_name": "Duplicate User",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_register_missing_required_fields_returns_422(client):
    # Missing password
    response = client.post("/api/auth/register", json={"email": "x@x.com"})
    assert response.status_code == 422


def test_register_invalid_email_returns_422(client):
    payload = {
        "email": "not-an-email",
        "password": "SecurePass1!",
        "full_name": "Bad Email",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_register_password_too_short_returns_422(client):
    payload = {
        "email": "short@example.com",
        "password": "abc",
        "full_name": "Short Pass",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Login (form-encoded – OAuth2PasswordRequestForm)
# ---------------------------------------------------------------------------

def test_form_login_success_returns_tokens(client, customer_user):
    response = client.post(
        "/api/auth/login",
        data={"username": CUSTOMER_EMAIL, "password": CUSTOMER_PASSWORD},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_form_login_wrong_password_returns_401(client, customer_user):
    response = client.post(
        "/api/auth/login",
        data={"username": CUSTOMER_EMAIL, "password": "WrongPassword!"},
    )
    assert response.status_code == 401


def test_form_login_unknown_user_returns_401(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "ghost@example.com", "password": "SomePass1!"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Login (JSON)
# ---------------------------------------------------------------------------

def test_json_login_success_returns_tokens(client, customer_user):
    response = client.post(
        "/api/auth/login/json",
        json={"email": CUSTOMER_EMAIL, "password": CUSTOMER_PASSWORD},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_json_login_wrong_password_returns_401(client, customer_user):
    response = client.post(
        "/api/auth/login/json",
        json={"email": CUSTOMER_EMAIL, "password": "WrongPass!"},
    )
    assert response.status_code == 401


def test_json_login_unknown_user_returns_401(client):
    response = client.post(
        "/api/auth/login/json",
        json={"email": "nobody@example.com", "password": "Pass1234!"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------

def test_get_me_with_valid_token(client, customer_headers, customer_user):
    response = client.get("/api/auth/me", headers=customer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == CUSTOMER_EMAIL
    assert data["role"] == "customer"


def test_get_me_without_token_returns_401(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_get_me_with_invalid_token_returns_401(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer bad.token.value"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /refresh
# ---------------------------------------------------------------------------

def test_refresh_token_returns_new_tokens(client, customer_headers, customer_user):
    response = client.post("/api/auth/refresh", headers=customer_headers)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_without_token_returns_401(client):
    response = client.post("/api/auth/refresh")
    assert response.status_code == 401
