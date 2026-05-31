from app.config import Settings


def _clear_database_env(monkeypatch):
    for key in ("DATABASE_URL", "SUPABASE_DB_URL", "SUPABASE_DATABASE_URL"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("SECRET_KEY", "test-secret")


def test_database_url_prefers_database_url(monkeypatch):
    _clear_database_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", "postgresql://primary.example/db")
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://supabase.example/db")

    settings = Settings(_env_file=None)

    assert settings.DATABASE_URL == "postgresql://primary.example/db"


def test_database_url_uses_supabase_db_url(monkeypatch):
    _clear_database_env(monkeypatch)
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://supabase.example/db")

    settings = Settings(_env_file=None)

    assert settings.DATABASE_URL == "postgresql://supabase.example/db"


def test_database_url_uses_supabase_database_url(monkeypatch):
    _clear_database_env(monkeypatch)
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://supabase-alt.example/db")

    settings = Settings(_env_file=None)

    assert settings.DATABASE_URL == "postgresql://supabase-alt.example/db"
