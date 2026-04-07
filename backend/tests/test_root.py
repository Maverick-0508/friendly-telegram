"""
Tests for the root and health-check endpoints.
"""
import pytest
from fastapi.testclient import TestClient


def test_root_returns_welcome_message(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "Welcome" in data["message"]
    assert "version" in data
    assert "docs" in data
    assert "redoc" in data


def test_health_check_returns_healthy(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


def test_unknown_route_returns_404(client):
    response = client.get("/nonexistent-route")
    assert response.status_code == 404
