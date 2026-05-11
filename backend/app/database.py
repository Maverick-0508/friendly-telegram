"""
Database configuration and session management
"""
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings


def _normalize_database_url(url: str) -> str:
    """
    Normalize a DATABASE_URL by safely handling special characters in passwords.
    Handles passwords with #, $, and other special characters that break URL parsing.
    """
    if not url:
        raise ValueError("DATABASE_URL is not set")

    # Let SQLAlchemy parse any percent-encoded credentials, then swap the driver
    # to the synchronous psycopg2 engine used by the rest of the codebase.
    parsed_url = make_url(url)

    if parsed_url.drivername == "postgresql+asyncpg":
        parsed_url = parsed_url.set(drivername="postgresql+psycopg2")

    return str(parsed_url)


def _build_fallback_sqlite_url() -> str:
    db_path = Path(__file__).resolve().parent.parent / "ammowing.db"
    return f"sqlite:///{db_path.as_posix()}"


def _create_engine_with_fallback():
    primary_db_url = _normalize_database_url(settings.DATABASE_URL)
    engine_kwargs = {
        "connect_args": {"check_same_thread": False} if "sqlite" in primary_db_url else {},
        "echo": settings.DEBUG,
    }

    try:
        engine = create_engine(primary_db_url, **engine_kwargs)
        with engine.connect():
            pass
        return engine
    except Exception:
        if not settings.DEBUG:
            raise

        fallback_db_url = _build_fallback_sqlite_url()
        fallback_engine = create_engine(
            fallback_db_url,
            connect_args={"check_same_thread": False},
            echo=settings.DEBUG,
        )
        return fallback_engine


# Create database engine
engine = _create_engine_with_fallback()

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency for getting database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
