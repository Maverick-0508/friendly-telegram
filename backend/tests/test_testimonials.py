"""
Tests for the /api/testimonials endpoints:
  GET    /testimonials                      (public, filterable)
  GET    /testimonials/{id}                 (public)
  POST   /testimonials                      (public)
  PUT    /testimonials/{id}                 (admin only)
  DELETE /testimonials/{id}                 (admin only)
  POST   /testimonials/{id}/approve         (admin only)
  POST   /testimonials/{id}/feature         (admin only)
"""
import pytest

TESTIMONIAL_PAYLOAD = {
    "customer_name": "Dave Green",
    "customer_email": "dave@example.com",
    "customer_location": "Sydney, NSW",
    "rating": 4.5,
    "title": "Great Service",
    "content": "Very happy with the lawn care. Highly recommend!",
    "service_type": "Lawn Mowing",
}


def create_testimonial(client, payload=None):
    data = payload or TESTIMONIAL_PAYLOAD
    response = client.post("/api/testimonials", json=data)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# POST /testimonials
# ---------------------------------------------------------------------------

def test_create_testimonial_returns_201(client):
    response = client.post("/api/testimonials", json=TESTIMONIAL_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["customer_name"] == "Dave Green"
    assert data["is_approved"] is False
    assert data["is_featured"] is False


def test_create_testimonial_missing_required_fields_returns_422(client):
    response = client.post("/api/testimonials", json={"customer_name": "X"})
    assert response.status_code == 422


def test_create_testimonial_rating_out_of_range_returns_422(client):
    payload = {**TESTIMONIAL_PAYLOAD, "rating": 6.0}
    response = client.post("/api/testimonials", json=payload)
    assert response.status_code == 422


def test_create_testimonial_rating_below_minimum_returns_422(client):
    payload = {**TESTIMONIAL_PAYLOAD, "rating": 0.5}
    response = client.post("/api/testimonials", json=payload)
    assert response.status_code == 422


def test_create_testimonial_content_too_long_returns_422(client):
    payload = {**TESTIMONIAL_PAYLOAD, "content": "x" * 1001}
    response = client.post("/api/testimonials", json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /testimonials  (public, filterable)
# ---------------------------------------------------------------------------

def test_get_testimonials_approved_only_by_default(client, admin_headers, admin_user):
    create_testimonial(client)
    # Default: approved_only=True → no results (pending approval)
    response = client.get("/api/testimonials")
    assert response.json() == []
    # approved_only=False → returns the new one
    response = client.get("/api/testimonials?approved_only=false")
    assert len(response.json()) == 1


def test_get_testimonials_featured_only_filter(client, admin_headers, admin_user):
    t = create_testimonial(client)
    # Feature it
    client.post(f"/api/testimonials/{t['id']}/feature", headers=admin_headers)
    # featured_only=True returns it
    response = client.get("/api/testimonials?approved_only=false&featured_only=true")
    assert len(response.json()) == 1
    # Non-featured testimonial excluded
    create_testimonial(client, {**TESTIMONIAL_PAYLOAD, "customer_email": "other@example.com"})
    response2 = client.get("/api/testimonials?approved_only=false&featured_only=true")
    assert len(response2.json()) == 1


def test_get_testimonials_pagination(client, admin_headers, admin_user):
    for i in range(5):
        create_testimonial(client, {**TESTIMONIAL_PAYLOAD, "customer_email": f"u{i}@example.com"})
    resp = client.get("/api/testimonials?approved_only=false&skip=0&limit=3")
    assert len(resp.json()) == 3


# ---------------------------------------------------------------------------
# GET /testimonials/{id}
# ---------------------------------------------------------------------------

def test_get_testimonial_by_id(client):
    t = create_testimonial(client)
    response = client.get(f"/api/testimonials/{t['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == t["id"]


def test_get_testimonial_not_found_returns_404(client):
    response = client.get("/api/testimonials/9999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /testimonials/{id}/approve  (admin only)
# ---------------------------------------------------------------------------

def test_approve_testimonial_as_admin(client, admin_headers, admin_user):
    t = create_testimonial(client)
    assert t["is_approved"] is False
    response = client.post(f"/api/testimonials/{t['id']}/approve", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["is_approved"] is True
    assert data["approved_at"] is not None


def test_approve_testimonial_without_auth_returns_401(client):
    t = create_testimonial(client)
    response = client.post(f"/api/testimonials/{t['id']}/approve")
    assert response.status_code == 401


def test_approve_testimonial_as_customer_returns_403(client, customer_headers, customer_user):
    t = create_testimonial(client)
    response = client.post(f"/api/testimonials/{t['id']}/approve", headers=customer_headers)
    assert response.status_code == 403


def test_approve_testimonial_not_found_returns_404(client, admin_headers, admin_user):
    response = client.post("/api/testimonials/9999/approve", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /testimonials/{id}/feature  (admin only)
# ---------------------------------------------------------------------------

def test_feature_testimonial_also_approves(client, admin_headers, admin_user):
    t = create_testimonial(client)
    response = client.post(f"/api/testimonials/{t['id']}/feature", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["is_featured"] is True
    assert data["is_approved"] is True


def test_feature_testimonial_not_found_returns_404(client, admin_headers, admin_user):
    response = client.post("/api/testimonials/9999/feature", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /testimonials/{id}  (admin only)
# ---------------------------------------------------------------------------

def test_update_testimonial_as_admin(client, admin_headers, admin_user):
    t = create_testimonial(client)
    response = client.put(
        f"/api/testimonials/{t['id']}",
        json={"is_approved": True, "is_featured": True},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_approved"] is True
    assert data["is_featured"] is True
    assert data["approved_at"] is not None


def test_update_testimonial_not_found_returns_404(client, admin_headers, admin_user):
    response = client.put("/api/testimonials/9999", json={"is_approved": True}, headers=admin_headers)
    assert response.status_code == 404


def test_update_testimonial_without_auth_returns_401(client):
    t = create_testimonial(client)
    response = client.put(f"/api/testimonials/{t['id']}", json={"is_approved": True})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /testimonials/{id}  (admin only)
# ---------------------------------------------------------------------------

def test_delete_testimonial_as_admin_returns_204(client, admin_headers, admin_user):
    t = create_testimonial(client)
    response = client.delete(f"/api/testimonials/{t['id']}", headers=admin_headers)
    assert response.status_code == 204
    assert client.get(f"/api/testimonials/{t['id']}").status_code == 404


def test_delete_testimonial_not_found_returns_404(client, admin_headers, admin_user):
    response = client.delete("/api/testimonials/9999", headers=admin_headers)
    assert response.status_code == 404


def test_delete_testimonial_as_customer_returns_403(client, customer_headers, customer_user):
    t = create_testimonial(client)
    response = client.delete(f"/api/testimonials/{t['id']}", headers=customer_headers)
    assert response.status_code == 403
