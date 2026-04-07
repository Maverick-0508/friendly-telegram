"""
Pytest configuration and shared fixtures for the AM Mowing API test suite.

Uses an in-memory SQLite database so tests are fully isolated from any
production or development database file.
"""
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set required environment variable before importing anything from the app
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.utils.auth import get_password_hash

# ---------------------------------------------------------------------------
# In-memory test database
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite://"  # pure in-memory, no file created

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ---------------------------------------------------------------------------
# Session-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create all tables once for the whole test session."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


# ---------------------------------------------------------------------------
# Function-scoped fixtures — each test gets a clean database state
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clean_db():
    """Truncate all tables after each test for isolation."""
    yield
    db = TestingSessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client():
    """Return a TestClient for the FastAPI application."""
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _make_user(db, email: str, password: str, role: UserRole, full_name: str = "Test User") -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        full_name=full_name,
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _get_token(client: TestClient, email: str, password: str) -> str:
    response = client.post(
        "/api/auth/login/json",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


# ---------------------------------------------------------------------------
# Convenience fixtures
# ---------------------------------------------------------------------------

CUSTOMER_EMAIL = "customer@example.com"
CUSTOMER_PASSWORD = "CustomerPass1!"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "AdminPass1!"


@pytest.fixture
def db():
    """Yield a database session for direct manipulation in tests."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def customer_user(db):
    """Create and return a customer user."""
    return _make_user(db, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, UserRole.CUSTOMER, "Customer User")


@pytest.fixture
def admin_user(db):
    """Create and return an admin user."""
    return _make_user(db, ADMIN_EMAIL, ADMIN_PASSWORD, UserRole.ADMIN, "Admin User")


@pytest.fixture
def customer_token(client, customer_user):
    """Return a valid JWT access token for the customer user."""
    return _get_token(client, CUSTOMER_EMAIL, CUSTOMER_PASSWORD)


@pytest.fixture
def admin_token(client, admin_user):
    """Return a valid JWT access token for the admin user."""
    return _get_token(client, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
