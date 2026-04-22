"""
Tests for the /api/services endpoints:
  GET    /services
  GET    /services/{service_id}
  GET    /services/slug/{slug}
  POST   /services         (admin only)
  PUT    /services/{id}    (admin only)
  DELETE /services/{id}    (admin only)
"""
import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SERVICE_PAYLOAD = {
    "name": "Lawn Mowing",
    "slug": "lawn-mowing",
    "description": "Regular lawn mowing service",
    "base_price": 75.0,
    "is_active": True,
    "display_order": 1,
}


def create_service(client, admin_headers, payload=None):
    data = payload or SERVICE_PAYLOAD
    response = client.post("/api/services", json=data, headers=admin_headers)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# GET /services
# ---------------------------------------------------------------------------

def test_get_services_returns_empty_list_initially(client):
    response = client.get("/api/services")
    assert response.status_code == 200
    assert response.json() == []


def test_get_services_returns_active_services(client, admin_headers, admin_user):
    create_service(client, admin_headers)
    response = client.get("/api/services")
    assert response.status_code == 200
    services = response.json()
    assert len(services) == 1
    assert services[0]["name"] == "Lawn Mowing"


def test_get_services_active_only_false_includes_inactive(client, admin_headers, admin_user):
    inactive_payload = {**SERVICE_PAYLOAD, "is_active": False, "slug": "inactive-svc"}
    create_service(client, admin_headers, inactive_payload)
    # active_only=True (default) should return 0
    resp_active = client.get("/api/services?active_only=true")
    assert resp_active.json() == []
    # active_only=False should return 1
    resp_all = client.get("/api/services?active_only=false")
    assert len(resp_all.json()) == 1


def test_get_services_pagination(client, admin_headers, admin_user):
    for i in range(5):
        create_service(client, admin_headers, {**SERVICE_PAYLOAD, "slug": f"svc-{i}", "name": f"Service {i}"})
    resp = client.get("/api/services?skip=0&limit=3")
    assert len(resp.json()) == 3


# ---------------------------------------------------------------------------
# GET /services/{service_id}
# ---------------------------------------------------------------------------

def test_get_service_by_id(client, admin_headers, admin_user):
    svc = create_service(client, admin_headers)
    response = client.get(f"/api/services/{svc['id']}")
    assert response.status_code == 200
    assert response.json()["slug"] == "lawn-mowing"


def test_get_service_by_invalid_id_returns_404(client):
    response = client.get("/api/services/9999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /services/slug/{slug}
# ---------------------------------------------------------------------------

def test_get_service_by_slug(client, admin_headers, admin_user):
    create_service(client, admin_headers)
    response = client.get("/api/services/slug/lawn-mowing")
    assert response.status_code == 200
    assert response.json()["name"] == "Lawn Mowing"


def test_get_service_by_unknown_slug_returns_404(client):
    response = client.get("/api/services/slug/does-not-exist")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /services  (admin only)
# ---------------------------------------------------------------------------

def test_create_service_as_admin_returns_201(client, admin_headers, admin_user):
    response = client.post("/api/services", json=SERVICE_PAYLOAD, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Lawn Mowing"
    assert "id" in data


def test_create_service_without_auth_returns_401(client):
    response = client.post("/api/services", json=SERVICE_PAYLOAD)
    assert response.status_code == 401


def test_create_service_as_customer_returns_403(client, customer_headers, customer_user):
    response = client.post("/api/services", json=SERVICE_PAYLOAD, headers=customer_headers)
    assert response.status_code == 403


def test_create_service_duplicate_slug_returns_400(client, admin_headers, admin_user):
    create_service(client, admin_headers)
    response = client.post("/api/services", json=SERVICE_PAYLOAD, headers=admin_headers)
    assert response.status_code == 400
    assert "slug" in response.json()["detail"].lower()


def test_create_service_missing_required_fields_returns_422(client, admin_headers, admin_user):
    response = client.post("/api/services", json={"name": "Incomplete"}, headers=admin_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# PUT /services/{service_id}  (admin only)
# ---------------------------------------------------------------------------

def test_update_service_as_admin(client, admin_headers, admin_user):
    svc = create_service(client, admin_headers)
    response = client.put(
        f"/api/services/{svc['id']}",
        json={"name": "Updated Mowing", "base_price": 90.0},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Mowing"
    assert response.json()["base_price"] == 90.0


def test_update_service_not_found_returns_404(client, admin_headers, admin_user):
    response = client.put("/api/services/9999", json={"name": "X"}, headers=admin_headers)
    assert response.status_code == 404


def test_update_service_duplicate_slug_returns_400(client, admin_headers, admin_user):
    svc1 = create_service(client, admin_headers)
    svc2 = create_service(client, admin_headers, {**SERVICE_PAYLOAD, "slug": "other-svc", "name": "Other"})
    response = client.put(
        f"/api/services/{svc2['id']}",
        json={"slug": svc1["slug"]},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_update_service_without_auth_returns_401(client, admin_headers, admin_user):
    svc = create_service(client, admin_headers)
    response = client.put(f"/api/services/{svc['id']}", json={"name": "X"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /services/{service_id}  (admin only)
# ---------------------------------------------------------------------------

def test_delete_service_as_admin_returns_204(client, admin_headers, admin_user):
    svc = create_service(client, admin_headers)
    response = client.delete(f"/api/services/{svc['id']}", headers=admin_headers)
    assert response.status_code == 204
    # Confirm it's gone
    assert client.get(f"/api/services/{svc['id']}").status_code == 404


def test_delete_service_not_found_returns_404(client, admin_headers, admin_user):
    response = client.delete("/api/services/9999", headers=admin_headers)
    assert response.status_code == 404


def test_delete_service_without_auth_returns_401(client, admin_headers, admin_user):
    svc = create_service(client, admin_headers)
    response = client.delete(f"/api/services/{svc['id']}")
    assert response.status_code == 401
