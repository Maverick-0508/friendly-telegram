"""
Tests for the /api/quotes endpoints:
  POST   /quotes                    (public)
  GET    /quotes                    (admin only)
  GET    /quotes/{id}               (owner or admin)
  PUT    /quotes/{id}               (admin only)
  DELETE /quotes/{id}               (admin only)
  GET    /quotes/user/{user_id}     (owner or admin)
"""
import pytest
from datetime import datetime, timedelta

QUOTE_PAYLOAD = {
    "full_name": "Alice Smith",
    "email": "alice@example.com",
    "phone": "+61412345678",
    "address": "1 Garden Street, Sydney NSW 2000",
    "property_size": 500.0,
    "property_type": "residential",
    "service_type": "Lawn Mowing",
    "service_frequency": "weekly",
    "additional_details": "Big backyard",
}


def create_quote(client, payload=None):
    data = payload or QUOTE_PAYLOAD
    response = client.post("/api/quotes", json=data)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# POST /quotes
# ---------------------------------------------------------------------------

def test_create_quote_returns_201(client):
    response = client.post("/api/quotes", json=QUOTE_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert data["status"] == "pending"
    assert "id" in data


def test_create_quote_missing_required_fields_returns_422(client):
    response = client.post("/api/quotes", json={"full_name": "X"})
    assert response.status_code == 422


def test_create_quote_invalid_email_returns_422(client):
    payload = {**QUOTE_PAYLOAD, "email": "not-an-email"}
    response = client.post("/api/quotes", json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /quotes  (admin only)
# ---------------------------------------------------------------------------

def test_get_quotes_as_admin(client, admin_headers, admin_user):
    create_quote(client)
    response = client.get("/api/quotes", headers=admin_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_quotes_without_auth_returns_401(client):
    response = client.get("/api/quotes")
    assert response.status_code == 401


def test_get_quotes_as_customer_returns_403(client, customer_headers, customer_user):
    response = client.get("/api/quotes", headers=customer_headers)
    assert response.status_code == 403


def test_get_quotes_status_filter(client, admin_headers, admin_user):
    create_quote(client)
    # Default pending
    response = client.get("/api/quotes?status_filter=pending", headers=admin_headers)
    assert len(response.json()) >= 1
    response_accepted = client.get("/api/quotes?status_filter=accepted", headers=admin_headers)
    assert response_accepted.json() == []


# ---------------------------------------------------------------------------
# GET /quotes/{id}
# ---------------------------------------------------------------------------

def test_get_quote_by_id_as_admin(client, admin_headers, admin_user):
    quote = create_quote(client)
    response = client.get(f"/api/quotes/{quote['id']}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["id"] == quote["id"]


def test_get_quote_not_found_returns_404(client, admin_headers, admin_user):
    response = client.get("/api/quotes/9999", headers=admin_headers)
    assert response.status_code == 404


def test_get_quote_as_non_owner_customer_returns_403(client, customer_headers, customer_user):
    # Quote created anonymously (user_id=None)
    quote = create_quote(client)
    # customer_user.id != None, so forbidden
    response = client.get(f"/api/quotes/{quote['id']}", headers=customer_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# PUT /quotes/{id}  (admin only)
# ---------------------------------------------------------------------------

def test_update_quote_status_as_admin(client, admin_headers, admin_user):
    quote = create_quote(client)
    response = client.put(
        f"/api/quotes/{quote['id']}",
        json={"status": "reviewed", "quoted_price": 150.0},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "reviewed"
    assert data["quoted_price"] == 150.0
    assert data["reviewed_at"] is not None


def test_update_quote_not_found_returns_404(client, admin_headers, admin_user):
    response = client.put("/api/quotes/9999", json={"status": "reviewed"}, headers=admin_headers)
    assert response.status_code == 404


def test_update_quote_without_auth_returns_401(client):
    quote = create_quote(client)
    response = client.put(f"/api/quotes/{quote['id']}", json={"status": "reviewed"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /quotes/{id}  (admin only)
# ---------------------------------------------------------------------------

def test_delete_quote_as_admin_returns_204(client, admin_headers, admin_user):
    quote = create_quote(client)
    response = client.delete(f"/api/quotes/{quote['id']}", headers=admin_headers)
    assert response.status_code == 204
    assert client.get(f"/api/quotes/{quote['id']}", headers=admin_headers).status_code == 404


def test_delete_quote_not_found_returns_404(client, admin_headers, admin_user):
    response = client.delete("/api/quotes/9999", headers=admin_headers)
    assert response.status_code == 404


def test_delete_quote_as_customer_returns_403(client, customer_headers, customer_user):
    quote = create_quote(client)
    response = client.delete(f"/api/quotes/{quote['id']}", headers=customer_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /quotes/user/{user_id}
# ---------------------------------------------------------------------------

def test_get_user_quotes_as_admin(client, admin_headers, admin_user, customer_user):
    response = client.get(f"/api/quotes/user/{customer_user.id}", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_user_quotes_as_other_customer_returns_403(client, customer_headers, customer_user, admin_user):
    # Try to read another user's quotes
    response = client.get(f"/api/quotes/user/{admin_user.id}", headers=customer_headers)
    assert response.status_code == 403
