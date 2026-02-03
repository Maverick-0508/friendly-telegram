"""
CORS middleware configuration
"""
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings


def setup_cors(app):
    """
    Setup CORS middleware for the FastAPI application
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS.split(",") if isinstance(settings.CORS_ALLOW_METHODS, str) else ["*"],
        allow_headers=settings.CORS_ALLOW_HEADERS.split(",") if isinstance(settings.CORS_ALLOW_HEADERS, str) else ["*"],
    )
