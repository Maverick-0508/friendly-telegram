"""
Tests for the /api/admin endpoints:
  GET  /admin/stats                     (admin only)
  GET  /admin/service-area/check        (public GET)
  POST /admin/service-area/check        (public POST)
"""
import pytest

from datetime import datetime, timedelta


def _seed_data(client, admin_headers):
    """Create one of each entity so stats are non-zero."""
    # Contact
    client.post("/api/contact", json={
        "full_name": "Seed Contact",
        "email": "seed@example.com",
        "message": "Seed message",
    })
    # Quote
    client.post("/api/quotes", json={
        "full_name": "Seed Quote",
        "email": "seedq@example.com",
        "phone": "+61412345678",
        "address": "1 Seed St",
        "service_type": "Lawn Mowing",
    })
    # Appointment
    future = (datetime.utcnow() + timedelta(days=5)).replace(microsecond=0).isoformat()
    client.post("/api/appointments", json={
        "full_name": "Seed Appt",
        "email": "seedappt@example.com",
        "phone": "+61412345678",
        "service_type": "Lawn Mowing",
        "address": "1 Seed St",
        "scheduled_date": future,
        "duration_minutes": 60,
    })
    # Testimonial (approved)
    resp = client.post("/api/testimonials", json={
        "customer_name": "Seed Testimonial",
        "rating": 5.0,
        "content": "Excellent!",
    })
    t_id = resp.json()["id"]
    client.post(f"/api/testimonials/{t_id}/approve", headers=admin_headers)


# ---------------------------------------------------------------------------
# GET /admin/stats
# ---------------------------------------------------------------------------

def test_get_stats_empty_db(client, admin_headers, admin_user):
    response = client.get("/api/admin/stats", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["totals"]["quotes"] == 0
    assert data["totals"]["appointments"] == 0
    assert data["totals"]["contacts"] == 0
    assert data["totals"]["testimonials"] == 0
    assert data["metrics"]["conversion_rate"] == 0
    assert data["metrics"]["average_rating"] == 0


def test_get_stats_reflects_seeded_data(client, admin_headers, admin_user):
    _seed_data(client, admin_headers)
    response = client.get("/api/admin/stats", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["totals"]["quotes"] >= 1
    assert data["totals"]["appointments"] >= 1
    assert data["totals"]["contacts"] >= 1
    assert data["totals"]["testimonials"] >= 1
    assert data["metrics"]["average_rating"] == 5.0


def test_get_stats_without_auth_returns_401(client):
    response = client.get("/api/admin/stats")
    assert response.status_code == 401


def test_get_stats_as_customer_returns_403(client, customer_headers, customer_user):
    response = client.get("/api/admin/stats", headers=customer_headers)
    assert response.status_code == 403


def test_get_stats_structure(client, admin_headers, admin_user):
    response = client.get("/api/admin/stats", headers=admin_headers)
    data = response.json()
    for key in ("totals", "pending", "appointments", "quotes_by_status", "recent_activity", "metrics"):
        assert key in data, f"Missing key: {key}"


def test_get_stats_pending_testimonials(client, admin_headers, admin_user):
    # Create unapproved testimonial
    client.post("/api/testimonials", json={
        "customer_name": "Pending Testi",
        "rating": 3.0,
        "content": "Pending review",
    })
    response = client.get("/api/admin/stats", headers=admin_headers)
    assert response.json()["pending"]["testimonials"] >= 1


# ---------------------------------------------------------------------------
# GET /admin/service-area/check
# ---------------------------------------------------------------------------

def test_service_area_check_get_within_area(client):
    # Sydney CBD – within 50 km of the default centre
    response = client.get("/api/admin/service-area/check?latitude=-33.8688&longitude=151.2093")
    assert response.status_code == 200
    data = response.json()
    assert data["in_service_area"] is True
    assert "distance_km" in data


def test_service_area_check_get_outside_area(client):
    # Melbourne – roughly 700 km from Sydney
    response = client.get("/api/admin/service-area/check?latitude=-37.8136&longitude=144.9631")
    assert response.status_code == 200
    data = response.json()
    assert data["in_service_area"] is False
    assert data["distance_km"] > 50


def test_service_area_check_get_missing_params_returns_422(client):
    response = client.get("/api/admin/service-area/check")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /admin/service-area/check
# ---------------------------------------------------------------------------

def test_service_area_check_post_within_area(client):
    response = client.post(
        "/api/admin/service-area/check",
        json={"latitude": -33.8688, "longitude": 151.2093},
    )
    assert response.status_code == 200
    assert response.json()["in_service_area"] is True


def test_service_area_check_post_outside_area(client):
    response = client.post(
        "/api/admin/service-area/check",
        json={"latitude": -37.8136, "longitude": 144.9631},
    )
    assert response.status_code == 200
    assert response.json()["in_service_area"] is False


def test_service_area_check_post_missing_latitude_returns_400(client):
    response = client.post(
        "/api/admin/service-area/check",
        json={"longitude": 151.2093},
    )
    assert response.status_code == 400


def test_service_area_check_post_missing_longitude_returns_400(client):
    response = client.post(
        "/api/admin/service-area/check",
        json={"latitude": -33.8688},
    )
    assert response.status_code == 400


def test_service_area_check_post_empty_body_returns_400(client):
    response = client.post("/api/admin/service-area/check", json={})
    assert response.status_code == 400
