"""
Tests for the /api/appointments endpoints:
  POST   /appointments                     (public)
  GET    /appointments                     (admin only)
  GET    /appointments/user/{user_id}      (owner or admin)
  GET    /appointments/{id}               (owner or admin)
  PUT    /appointments/{id}               (owner or admin)
  DELETE /appointments/{id}               (owner or admin)
"""
import pytest
from datetime import datetime, timedelta


def future_date_str(days: int = 7) -> str:
    dt = datetime.utcnow() + timedelta(days=days)
    return dt.replace(hour=10, minute=0, second=0, microsecond=0).isoformat()


APPOINTMENT_PAYLOAD = {
    "full_name": "Bob Jones",
    "email": "bob@example.com",
    "phone": "+61412345678",
    "service_type": "Lawn Treatment",
    "address": "10 Park Ave, Sydney NSW 2000",
    "scheduled_date": future_date_str(),
    "duration_minutes": 90,
    "notes": "Bring eco-friendly products",
}


def create_appointment(client, payload=None):
    data = payload or APPOINTMENT_PAYLOAD
    response = client.post("/api/appointments", json=data)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# POST /appointments
# ---------------------------------------------------------------------------

def test_create_appointment_returns_201(client):
    response = client.post("/api/appointments", json=APPOINTMENT_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "bob@example.com"
    assert data["status"] == "scheduled"
    assert data["scheduled_end_date"] is not None


def test_create_appointment_calculates_end_date(client):
    data = create_appointment(client)
    start = datetime.fromisoformat(data["scheduled_date"])
    end = datetime.fromisoformat(data["scheduled_end_date"])
    assert (end - start).seconds == 90 * 60


def test_create_appointment_missing_required_fields_returns_422(client):
    response = client.post("/api/appointments", json={"full_name": "X"})
    assert response.status_code == 422


def test_create_appointment_invalid_duration_returns_422(client):
    payload = {**APPOINTMENT_PAYLOAD, "duration_minutes": 5}  # below minimum of 15
    response = client.post("/api/appointments", json=payload)
    assert response.status_code == 422


def test_create_appointment_duration_too_long_returns_422(client):
    payload = {**APPOINTMENT_PAYLOAD, "duration_minutes": 600}  # above max of 480
    response = client.post("/api/appointments", json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /appointments  (admin only)
# ---------------------------------------------------------------------------

def test_get_appointments_as_admin(client, admin_headers, admin_user):
    create_appointment(client)
    response = client.get("/api/appointments", headers=admin_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_appointments_without_auth_returns_401(client):
    response = client.get("/api/appointments")
    assert response.status_code == 401


def test_get_appointments_as_customer_returns_403(client, customer_headers, customer_user):
    response = client.get("/api/appointments", headers=customer_headers)
    assert response.status_code == 403


def test_get_appointments_status_filter(client, admin_headers, admin_user):
    create_appointment(client)
    resp_scheduled = client.get("/api/appointments?status_filter=scheduled", headers=admin_headers)
    assert len(resp_scheduled.json()) == 1
    resp_completed = client.get("/api/appointments?status_filter=completed", headers=admin_headers)
    assert resp_completed.json() == []


# ---------------------------------------------------------------------------
# GET /appointments/{id}
# ---------------------------------------------------------------------------

def test_get_appointment_by_id_as_admin(client, admin_headers, admin_user):
    appt = create_appointment(client)
    response = client.get(f"/api/appointments/{appt['id']}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["id"] == appt["id"]


def test_get_appointment_not_found_returns_404(client, admin_headers, admin_user):
    response = client.get("/api/appointments/9999", headers=admin_headers)
    assert response.status_code == 404


def test_get_appointment_as_non_owner_returns_403(client, customer_headers, customer_user):
    appt = create_appointment(client)
    response = client.get(f"/api/appointments/{appt['id']}", headers=customer_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /appointments/user/{user_id}
# ---------------------------------------------------------------------------

def test_get_user_appointments_as_admin(client, admin_headers, admin_user, customer_user):
    response = client.get(f"/api/appointments/user/{customer_user.id}", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_user_appointments_as_other_customer_returns_403(client, customer_headers, customer_user, admin_user):
    response = client.get(f"/api/appointments/user/{admin_user.id}", headers=customer_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# PUT /appointments/{id}
# ---------------------------------------------------------------------------

def test_update_appointment_as_admin(client, admin_headers, admin_user):
    appt = create_appointment(client)
    new_date = future_date_str(14)
    response = client.put(
        f"/api/appointments/{appt['id']}",
        json={"scheduled_date": new_date, "status": "confirmed"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "confirmed"
    assert data["confirmed_at"] is not None


def test_update_appointment_to_completed_sets_completed_at(client, admin_headers, admin_user):
    appt = create_appointment(client)
    response = client.put(
        f"/api/appointments/{appt['id']}",
        json={"status": "completed"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["completed_at"] is not None


def test_update_appointment_not_found_returns_404(client, admin_headers, admin_user):
    response = client.put("/api/appointments/9999", json={"notes": "x"}, headers=admin_headers)
    assert response.status_code == 404


def test_update_appointment_without_auth_returns_401(client):
    appt = create_appointment(client)
    response = client.put(f"/api/appointments/{appt['id']}", json={"notes": "x"})
    assert response.status_code == 401


def test_update_appointment_as_non_owner_returns_403(client, customer_headers, customer_user):
    appt = create_appointment(client)
    response = client.put(f"/api/appointments/{appt['id']}", json={"notes": "x"}, headers=customer_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /appointments/{id}
# ---------------------------------------------------------------------------

def test_delete_appointment_as_admin_returns_204(client, admin_headers, admin_user):
    appt = create_appointment(client)
    response = client.delete(f"/api/appointments/{appt['id']}", headers=admin_headers)
    assert response.status_code == 204
    assert client.get(f"/api/appointments/{appt['id']}", headers=admin_headers).status_code == 404


def test_delete_appointment_not_found_returns_404(client, admin_headers, admin_user):
    response = client.delete("/api/appointments/9999", headers=admin_headers)
    assert response.status_code == 404


def test_delete_appointment_as_non_owner_returns_403(client, customer_headers, customer_user):
    appt = create_appointment(client)
    response = client.delete(f"/api/appointments/{appt['id']}", headers=customer_headers)
    assert response.status_code == 403
