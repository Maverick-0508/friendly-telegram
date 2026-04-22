"""
Tests for Work Order CRUD and forwarding pipeline endpoints.

  POST /api/work-orders                        (supervisor/admin)
  GET  /api/work-orders                        (supervisor/admin)
  GET  /api/work-orders/{id}                   (supervisor/admin)
  PUT  /api/work-orders/{id}                   (supervisor/admin)
  DELETE /api/work-orders/{id}                 (admin only)
  POST /api/work-orders/forward/quote          (supervisor/admin)
  POST /api/work-orders/forward/contact        (supervisor/admin)
  POST /api/work-orders/forward/appointment    (supervisor/admin)
"""
import pytest
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WORK_ORDER_BASE = {
    "title": "Trim front garden",
    "client_name": "Alice Smith",
    "client_email": "alice@example.com",
    "client_phone": "+61412000001",
    "property_address": "10 Rose St, Sydney NSW 2000",
    "service_type": "Garden Trimming",
    "priority": "medium",
}


def _create_quote(client):
    resp = client.post("/api/quotes", json={
        "full_name": "Bob Brown",
        "email": "bob@example.com",
        "phone": "+61412000002",
        "address": "5 Oak Ave",
        "service_type": "Lawn Mowing",
        "additional_details": "Large backyard with a pool fence",
    })
    assert resp.status_code == 201
    return resp.json()


def _create_contact(client):
    resp = client.post("/api/contact", json={
        "full_name": "Carol White",
        "email": "carol@example.com",
        "phone": "+61412000003",
        "subject": "Need hedge trimming",
        "service_type": "Hedge Trimming",
        "message": "Please come on a weekday morning.",
    })
    assert resp.status_code == 201
    return resp.json()


def _create_appointment(client):
    future = (datetime.utcnow() + timedelta(days=3)).replace(microsecond=0).isoformat()
    resp = client.post("/api/appointments", json={
        "full_name": "Dave Green",
        "email": "dave@example.com",
        "phone": "+61412000004",
        "service_type": "Lawn Mowing",
        "address": "7 Pine Rd",
        "scheduled_date": future,
        "duration_minutes": 90,
    })
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def test_create_work_order_as_supervisor(client, supervisor_headers, supervisor_user):
    resp = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == WORK_ORDER_BASE["title"]
    assert data["source_type"] == "manual"
    assert data["status"] == "incoming"


def test_create_work_order_as_admin(client, admin_headers, admin_user):
    resp = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=admin_headers)
    assert resp.status_code == 201


def test_create_work_order_as_customer_returns_403(client, customer_headers, customer_user):
    resp = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=customer_headers)
    assert resp.status_code == 403


def test_create_work_order_without_auth_returns_401(client):
    resp = client.post("/api/work-orders", json=WORK_ORDER_BASE)
    assert resp.status_code == 401


def test_create_work_order_missing_required_fields_returns_422(client, supervisor_headers, supervisor_user):
    resp = client.post("/api/work-orders", json={"title": "Only title"}, headers=supervisor_headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

def test_list_work_orders_empty(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/work-orders", headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_work_orders_returns_created(client, supervisor_headers, supervisor_user):
    client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers)
    resp = client.get("/api/work-orders", headers=supervisor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_list_work_orders_status_filter(client, supervisor_headers, supervisor_user):
    client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers)
    resp = client.get("/api/work-orders?status_filter=incoming", headers=supervisor_headers)
    assert resp.status_code == 200
    # A manually created WO has source_type=manual but its status defaults to INCOMING
    assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------

def test_get_work_order(client, supervisor_headers, supervisor_user):
    created = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers).json()
    resp = client.get(f"/api/work-orders/{created['id']}", headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_nonexistent_work_order_returns_404(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/work-orders/9999", headers=supervisor_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def test_update_work_order_status(client, supervisor_headers, supervisor_user):
    wo = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers).json()
    resp = client.put(
        f"/api/work-orders/{wo['id']}",
        json={"status": "reviewed"},
        headers=supervisor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "reviewed"


def test_update_work_order_to_in_progress_stamps_started_at(client, supervisor_headers, supervisor_user):
    wo = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers).json()
    resp = client.put(
        f"/api/work-orders/{wo['id']}",
        json={"status": "in_progress"},
        headers=supervisor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["started_at"] is not None


def test_update_work_order_to_completed_stamps_completed_at(client, supervisor_headers, supervisor_user):
    wo = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers).json()
    resp = client.put(
        f"/api/work-orders/{wo['id']}",
        json={"status": "completed"},
        headers=supervisor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["completed_at"] is not None


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_work_order_as_admin(client, admin_headers, admin_user):
    wo = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=admin_headers).json()
    resp = client.delete(f"/api/work-orders/{wo['id']}", headers=admin_headers)
    assert resp.status_code == 204


def test_delete_work_order_as_supervisor_returns_403(client, supervisor_headers, supervisor_user):
    wo = client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=supervisor_headers).json()
    resp = client.delete(f"/api/work-orders/{wo['id']}", headers=supervisor_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Forward from Quote
# ---------------------------------------------------------------------------

def test_forward_from_quote(client, supervisor_headers, supervisor_user):
    quote = _create_quote(client)
    resp = client.post(
        "/api/work-orders/forward/quote",
        json={"quote_id": quote["id"]},
        headers=supervisor_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["source_type"] == "quote"
    assert data["source_quote_id"] == quote["id"]
    assert data["client_name"] == quote["full_name"]
    assert data["property_address"] == quote["address"]
    assert data["status"] == "incoming"


def test_forward_from_quote_custom_title(client, supervisor_headers, supervisor_user):
    quote = _create_quote(client)
    resp = client.post(
        "/api/work-orders/forward/quote",
        json={"quote_id": quote["id"], "title": "Custom WO Title"},
        headers=supervisor_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Custom WO Title"


def test_forward_from_nonexistent_quote_returns_404(client, supervisor_headers, supervisor_user):
    resp = client.post(
        "/api/work-orders/forward/quote",
        json={"quote_id": 9999},
        headers=supervisor_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Forward from Contact
# ---------------------------------------------------------------------------

def test_forward_from_contact(client, supervisor_headers, supervisor_user):
    contact = _create_contact(client)
    resp = client.post(
        "/api/work-orders/forward/contact",
        json={"contact_id": contact["id"]},
        headers=supervisor_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["source_type"] == "contact"
    assert data["source_contact_id"] == contact["id"]
    assert data["client_name"] == contact["full_name"]


def test_forward_from_nonexistent_contact_returns_404(client, supervisor_headers, supervisor_user):
    resp = client.post(
        "/api/work-orders/forward/contact",
        json={"contact_id": 9999},
        headers=supervisor_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Forward from Appointment
# ---------------------------------------------------------------------------

def test_forward_from_appointment(client, supervisor_headers, supervisor_user):
    appt = _create_appointment(client)
    resp = client.post(
        "/api/work-orders/forward/appointment",
        json={"appointment_id": appt["id"]},
        headers=supervisor_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["source_type"] == "appointment"
    assert data["source_appointment_id"] == appt["id"]
    assert data["client_name"] == appt["full_name"]


def test_forward_from_nonexistent_appointment_returns_404(client, supervisor_headers, supervisor_user):
    resp = client.post(
        "/api/work-orders/forward/appointment",
        json={"appointment_id": 9999},
        headers=supervisor_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Task Items sub-resource
# ---------------------------------------------------------------------------

def _make_wo(client, headers):
    return client.post("/api/work-orders", json=WORK_ORDER_BASE, headers=headers).json()


def test_create_task_item(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    resp = client.post("/api/task-items", json={
        "work_order_id": wo["id"],
        "title": "Mow front lawn",
        "is_client_requested": True,
    }, headers=supervisor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Mow front lawn"
    assert data["status"] == "pending"
    assert data["is_client_requested"] is True


def test_list_task_items_for_work_order(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    client.post("/api/task-items", json={"work_order_id": wo["id"], "title": "Task A"}, headers=supervisor_headers)
    client.post("/api/task-items", json={"work_order_id": wo["id"], "title": "Task B"}, headers=supervisor_headers)
    resp = client.get(f"/api/task-items/work-order/{wo['id']}", headers=supervisor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_update_task_item_to_done_stamps_completed_at(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    item = client.post("/api/task-items", json={"work_order_id": wo["id"], "title": "Do it"}, headers=supervisor_headers).json()
    resp = client.put(f"/api/task-items/{item['id']}", json={"status": "done"}, headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json()["completed_at"] is not None


def test_delete_task_item(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    item = client.post("/api/task-items", json={"work_order_id": wo["id"], "title": "Temp task"}, headers=supervisor_headers).json()
    resp = client.delete(f"/api/task-items/{item['id']}", headers=supervisor_headers)
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Field Logs sub-resource
# ---------------------------------------------------------------------------

def test_create_field_log(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    resp = client.post("/api/field-logs", json={
        "work_order_id": wo["id"],
        "work_done_summary": "Mowed the front and back lawn",
        "labor_hours": 2.5,
    }, headers=supervisor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["labor_hours"] == 2.5
    assert data["logged_by_id"] == supervisor_user.id


def test_list_field_logs(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    client.post("/api/field-logs", json={"work_order_id": wo["id"], "work_done_summary": "Log 1"}, headers=supervisor_headers)
    client.post("/api/field-logs", json={"work_order_id": wo["id"], "work_done_summary": "Log 2"}, headers=supervisor_headers)
    resp = client.get(f"/api/field-logs/work-order/{wo['id']}", headers=supervisor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# Resource Plans sub-resource
# ---------------------------------------------------------------------------

def test_create_resource_plan(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    resp = client.post("/api/resource-plans", json={
        "work_order_id": wo["id"],
        "crew_count": 3,
        "estimated_labor_hours": 6.0,
        "equipment_list": '["ride-on mower", "edger"]',
    }, headers=supervisor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["crew_count"] == 3
    assert data["created_by_id"] == supervisor_user.id


def test_update_resource_plan(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    plan = client.post("/api/resource-plans", json={
        "work_order_id": wo["id"],
        "crew_count": 2,
    }, headers=supervisor_headers).json()
    resp = client.put(f"/api/resource-plans/{plan['id']}", json={"crew_count": 4}, headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json()["crew_count"] == 4


# ---------------------------------------------------------------------------
# Issue Notes sub-resource
# ---------------------------------------------------------------------------

def test_create_issue_note(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    resp = client.post("/api/issue-notes", json={
        "work_order_id": wo["id"],
        "issue_type": "weather",
        "severity": "medium",
        "title": "Heavy rain forecast",
        "description": "May need to reschedule.",
    }, headers=supervisor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["is_resolved"] is False
    assert data["resolved_at"] is None


def test_resolve_issue_note_stamps_resolved_at(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    note = client.post("/api/issue-notes", json={
        "work_order_id": wo["id"],
        "issue_type": "blocker",
        "severity": "high",
        "title": "Gate locked",
    }, headers=supervisor_headers).json()
    resp = client.put(
        f"/api/issue-notes/{note['id']}",
        json={"is_resolved": True, "resolution_notes": "Client opened gate"},
        headers=supervisor_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_resolved"] is True
    assert data["resolved_at"] is not None


def test_list_issue_notes_unresolved_only(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    n1 = client.post("/api/issue-notes", json={"work_order_id": wo["id"], "title": "Open", "issue_type": "other", "severity": "low"}, headers=supervisor_headers).json()
    n2 = client.post("/api/issue-notes", json={"work_order_id": wo["id"], "title": "Closed", "issue_type": "other", "severity": "low"}, headers=supervisor_headers).json()
    client.put(f"/api/issue-notes/{n2['id']}", json={"is_resolved": True}, headers=supervisor_headers)

    resp = client.get(f"/api/issue-notes/work-order/{wo['id']}?unresolved_only=true", headers=supervisor_headers)
    assert resp.status_code == 200
    ids = [i["id"] for i in resp.json()]
    assert n1["id"] in ids
    assert n2["id"] not in ids
