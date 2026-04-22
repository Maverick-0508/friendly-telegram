"""
Tests for Supervisor Dashboard endpoints.

  GET /api/supervisor/queue
  GET /api/supervisor/planning
  GET /api/supervisor/active
  GET /api/supervisor/property
  GET /api/supervisor/exceptions
  GET /api/supervisor/report
  GET /api/supervisor/stats
"""
import pytest
from datetime import datetime, timedelta


WORK_ORDER_BASE = {
    "title": "Test job",
    "client_name": "Test Client",
    "property_address": "1 Test St",
}


def _make_wo(client, headers, **overrides):
    payload = {**WORK_ORDER_BASE, **overrides}
    resp = client.post("/api/work-orders", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


def _advance_status(client, headers, wo_id, new_status):
    resp = client.put(f"/api/work-orders/{wo_id}", json={"status": new_status}, headers=headers)
    assert resp.status_code == 200
    return resp.json()


# ---------------------------------------------------------------------------
# Auth checks (all supervisor endpoints require supervisor/admin)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("url", [
    "/api/supervisor/queue",
    "/api/supervisor/planning",
    "/api/supervisor/active",
    "/api/supervisor/exceptions",
    "/api/supervisor/report",
    "/api/supervisor/stats",
])
def test_supervisor_endpoints_require_auth(client, url):
    assert client.get(url).status_code == 401


@pytest.mark.parametrize("url", [
    "/api/supervisor/queue",
    "/api/supervisor/planning",
    "/api/supervisor/active",
    "/api/supervisor/exceptions",
    "/api/supervisor/report",
    "/api/supervisor/stats",
])
def test_supervisor_endpoints_deny_customers(client, customer_headers, customer_user, url):
    assert client.get(url, headers=customer_headers).status_code == 403


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

def test_queue_is_empty_initially(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/supervisor/queue", headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_queue_shows_incoming_work_orders(client, supervisor_headers, supervisor_user):
    _make_wo(client, supervisor_headers)
    resp = client.get("/api/supervisor/queue", headers=supervisor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "incoming"


def test_queue_excludes_reviewed_work_orders(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    _advance_status(client, supervisor_headers, wo["id"], "reviewed")
    resp = client.get("/api/supervisor/queue", headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Planning Board
# ---------------------------------------------------------------------------

def test_planning_board_shows_reviewed_and_planned(client, supervisor_headers, supervisor_user):
    wo1 = _make_wo(client, supervisor_headers, title="Reviewed job")
    wo2 = _make_wo(client, supervisor_headers, title="Planned job")
    _advance_status(client, supervisor_headers, wo1["id"], "reviewed")
    _advance_status(client, supervisor_headers, wo2["id"], "planned")

    resp = client.get("/api/supervisor/planning", headers=supervisor_headers)
    assert resp.status_code == 200
    statuses = {w["status"] for w in resp.json()}
    assert "reviewed" in statuses
    assert "planned" in statuses
    assert "incoming" not in statuses


# ---------------------------------------------------------------------------
# Active Jobs
# ---------------------------------------------------------------------------

def test_active_shows_in_progress_jobs(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    _advance_status(client, supervisor_headers, wo["id"], "in_progress")

    resp = client.get("/api/supervisor/active", headers=supervisor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "in_progress"


def test_active_excludes_completed_jobs(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    _advance_status(client, supervisor_headers, wo["id"], "completed")

    resp = client.get("/api/supervisor/active", headers=supervisor_headers)
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Property History
# ---------------------------------------------------------------------------

def test_property_history_requires_address_param(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/supervisor/property", headers=supervisor_headers)
    assert resp.status_code == 422


def test_property_history_returns_matching_work_orders(client, supervisor_headers, supervisor_user):
    _make_wo(client, supervisor_headers, property_address="42 Maple Ave, Sydney")
    _make_wo(client, supervisor_headers, property_address="99 Different Rd, Perth")

    resp = client.get("/api/supervisor/property?address=Maple", headers=supervisor_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert "Maple" in results[0]["property_address"]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

def test_exceptions_structure(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/supervisor/exceptions", headers=supervisor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "overdue" in data
    assert "blocked" in data
    assert "missing_field_logs" in data


def test_exceptions_overdue_detection(client, supervisor_headers, supervisor_user, db):
    """A work order with a past target_date and non-terminal status should appear in overdue."""
    from app.models.work_order import WorkOrder, WorkOrderStatus
    from tests.conftest import TestingSessionLocal

    wo = _make_wo(client, supervisor_headers)

    # Directly set target_date to the past via DB
    session = TestingSessionLocal()
    try:
        record = session.query(WorkOrder).filter(WorkOrder.id == wo["id"]).first()
        record.target_date = datetime.utcnow() - timedelta(days=5)
        session.commit()
    finally:
        session.close()

    resp = client.get("/api/supervisor/exceptions", headers=supervisor_headers)
    overdue_ids = [w["id"] for w in resp.json()["overdue"]]
    assert wo["id"] in overdue_ids


def test_exceptions_missing_field_logs(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    _advance_status(client, supervisor_headers, wo["id"], "in_progress")

    resp = client.get("/api/supervisor/exceptions", headers=supervisor_headers)
    missing_ids = [w["id"] for w in resp.json()["missing_field_logs"]]
    assert wo["id"] in missing_ids


def test_exceptions_missing_field_logs_clears_after_log_added(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    _advance_status(client, supervisor_headers, wo["id"], "in_progress")

    client.post("/api/field-logs", json={
        "work_order_id": wo["id"],
        "work_done_summary": "Did the work",
    }, headers=supervisor_headers)

    resp = client.get("/api/supervisor/exceptions", headers=supervisor_headers)
    missing_ids = [w["id"] for w in resp.json()["missing_field_logs"]]
    assert wo["id"] not in missing_ids


# ---------------------------------------------------------------------------
# KPI Report
# ---------------------------------------------------------------------------

def test_report_structure(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/supervisor/report", headers=supervisor_headers)
    assert resp.status_code == 200
    data = resp.json()
    for key in ("period_days", "work_orders", "tasks", "labour", "turnaround", "issues"):
        assert key in data


def test_report_counts_work_orders(client, supervisor_headers, supervisor_user):
    _make_wo(client, supervisor_headers)
    _make_wo(client, supervisor_headers)
    resp = client.get("/api/supervisor/report?days=30", headers=supervisor_headers)
    assert resp.json()["work_orders"]["total"] >= 2


def test_report_counts_completed_tasks(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    item = client.post("/api/task-items", json={"work_order_id": wo["id"], "title": "T1"}, headers=supervisor_headers).json()
    client.put(f"/api/task-items/{item['id']}", json={"status": "done"}, headers=supervisor_headers)

    resp = client.get("/api/supervisor/report", headers=supervisor_headers)
    data = resp.json()
    assert data["tasks"]["total_planned"] >= 1
    assert data["tasks"]["completed"] >= 1


def test_report_tracks_labour_hours(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    client.post("/api/field-logs", json={
        "work_order_id": wo["id"],
        "work_done_summary": "Completed mowing",
        "labor_hours": 3.0,
    }, headers=supervisor_headers)

    resp = client.get("/api/supervisor/report", headers=supervisor_headers)
    assert resp.json()["labour"]["total_hours"] >= 3.0


def test_report_issue_resolution_rate(client, supervisor_headers, supervisor_user):
    wo = _make_wo(client, supervisor_headers)
    n1 = client.post("/api/issue-notes", json={"work_order_id": wo["id"], "title": "Issue A", "issue_type": "other", "severity": "low"}, headers=supervisor_headers).json()
    n2 = client.post("/api/issue-notes", json={"work_order_id": wo["id"], "title": "Issue B", "issue_type": "other", "severity": "low"}, headers=supervisor_headers).json()
    client.put(f"/api/issue-notes/{n1['id']}", json={"is_resolved": True}, headers=supervisor_headers)

    resp = client.get("/api/supervisor/report", headers=supervisor_headers)
    issues = resp.json()["issues"]
    assert issues["total"] == 2
    assert issues["resolved"] == 1
    assert issues["resolution_rate_pct"] == 50.0


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def test_stats_structure(client, supervisor_headers, supervisor_user):
    resp = client.get("/api/supervisor/stats", headers=supervisor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "work_orders_by_status" in data
    assert "open_issues" in data
    assert "pending_tasks" in data


def test_stats_counts_by_status(client, supervisor_headers, supervisor_user):
    _make_wo(client, supervisor_headers)
    wo2 = _make_wo(client, supervisor_headers)
    _advance_status(client, supervisor_headers, wo2["id"], "reviewed")

    resp = client.get("/api/supervisor/stats", headers=supervisor_headers)
    data = resp.json()["work_orders_by_status"]
    assert data["incoming"] >= 1
    assert data["reviewed"] >= 1


def test_stats_accessible_as_admin(client, admin_headers, admin_user):
    resp = client.get("/api/supervisor/stats", headers=admin_headers)
    assert resp.status_code == 200
