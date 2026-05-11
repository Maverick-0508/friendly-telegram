"""
CORS middleware configuration
"""
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings


def setup_cors(app):
    """
    Setup CORS middleware for the FastAPI application
    """
    # Respect configured CORS origins, but during local development (DEBUG)
    # allow all origins to avoid "null" origin issues when opening files
    origins = settings.get_cors_origins()
    if settings.DEBUG:
        # Allow everything for local debugging to avoid file:// origin blocks
        origins = ["*"]

    # If allow_origins contains '*', credentials must be False per CORS rules
    allow_credentials = settings.CORS_ALLOW_CREDENTIALS and ("*" not in origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=settings.CORS_ALLOW_METHODS.split(",") if isinstance(settings.CORS_ALLOW_METHODS, str) else ["*"],
        allow_headers=settings.CORS_ALLOW_HEADERS.split(",") if isinstance(settings.CORS_ALLOW_HEADERS, str) else ["*"],
    )
