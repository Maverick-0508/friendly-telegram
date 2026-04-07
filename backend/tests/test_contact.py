"""
Tests for the /api/contact endpoints:
  POST   /contact                          (public)
  GET    /contact                          (admin only)
  GET    /contact/{id}                     (admin only – also marks as read)
  PUT    /contact/{id}/mark-replied        (admin only)
  DELETE /contact/{id}                     (admin only)
"""
import pytest

CONTACT_PAYLOAD = {
    "full_name": "Carol White",
    "email": "carol@example.com",
    "phone": "+61412345678",
    "subject": "Service Inquiry",
    "service_type": "Lawn Mowing",
    "message": "I would like to know more about your weekly service.",
}


def create_contact(client, payload=None):
    data = payload or CONTACT_PAYLOAD
    response = client.post("/api/contact", json=data)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# POST /contact
# ---------------------------------------------------------------------------

def test_create_contact_returns_201(client):
    response = client.post("/api/contact", json=CONTACT_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "carol@example.com"
    assert data["is_read"] is False
    assert data["is_replied"] is False
    assert "id" in data


def test_create_contact_missing_required_fields_returns_422(client):
    response = client.post("/api/contact", json={"full_name": "X"})
    assert response.status_code == 422


def test_create_contact_message_too_long_returns_422(client):
    payload = {**CONTACT_PAYLOAD, "message": "x" * 2001}
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 422


def test_create_contact_minimal_payload(client):
    payload = {
        "full_name": "Min User",
        "email": "min@example.com",
        "message": "Hello",
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 201


# ---------------------------------------------------------------------------
# GET /contact  (admin only)
# ---------------------------------------------------------------------------

def test_get_contacts_as_admin(client, admin_headers, admin_user):
    create_contact(client)
    response = client.get("/api/contact", headers=admin_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_contacts_without_auth_returns_401(client):
    response = client.get("/api/contact")
    assert response.status_code == 401


def test_get_contacts_as_customer_returns_403(client, customer_headers, customer_user):
    response = client.get("/api/contact", headers=customer_headers)
    assert response.status_code == 403


def test_get_contacts_unread_only_filter(client, admin_headers, admin_user):
    create_contact(client)
    # All unread at this point
    resp_unread = client.get("/api/contact?unread_only=true", headers=admin_headers)
    assert len(resp_unread.json()) == 1
    # Mark as read by fetching individual record
    contact_id = resp_unread.json()[0]["id"]
    client.get(f"/api/contact/{contact_id}", headers=admin_headers)
    # Now filter should be empty
    resp_unread2 = client.get("/api/contact?unread_only=true", headers=admin_headers)
    assert resp_unread2.json() == []


# ---------------------------------------------------------------------------
# GET /contact/{id}  (marks as read)
# ---------------------------------------------------------------------------

def test_get_contact_by_id_marks_as_read(client, admin_headers, admin_user):
    contact = create_contact(client)
    assert contact["is_read"] is False
    response = client.get(f"/api/contact/{contact['id']}", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["is_read"] is True
    assert data["read_at"] is not None


def test_get_contact_not_found_returns_404(client, admin_headers, admin_user):
    response = client.get("/api/contact/9999", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /contact/{id}/mark-replied  (admin only)
# ---------------------------------------------------------------------------

def test_mark_contact_replied_as_admin(client, admin_headers, admin_user):
    contact = create_contact(client)
    response = client.put(f"/api/contact/{contact['id']}/mark-replied", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["is_replied"] is True
    assert data["replied_at"] is not None
    # Also marks as read
    assert data["is_read"] is True


def test_mark_replied_not_found_returns_404(client, admin_headers, admin_user):
    response = client.put("/api/contact/9999/mark-replied", headers=admin_headers)
    assert response.status_code == 404


def test_mark_replied_without_auth_returns_401(client):
    contact = create_contact(client)
    response = client.put(f"/api/contact/{contact['id']}/mark-replied")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /contact/{id}  (admin only)
# ---------------------------------------------------------------------------

def test_delete_contact_as_admin_returns_204(client, admin_headers, admin_user):
    contact = create_contact(client)
    response = client.delete(f"/api/contact/{contact['id']}", headers=admin_headers)
    assert response.status_code == 204
    assert client.get(f"/api/contact/{contact['id']}", headers=admin_headers).status_code == 404


def test_delete_contact_not_found_returns_404(client, admin_headers, admin_user):
    response = client.delete("/api/contact/9999", headers=admin_headers)
    assert response.status_code == 404


def test_delete_contact_as_customer_returns_403(client, customer_headers, customer_user):
    contact = create_contact(client)
    response = client.delete(f"/api/contact/{contact['id']}", headers=customer_headers)
    assert response.status_code == 403
