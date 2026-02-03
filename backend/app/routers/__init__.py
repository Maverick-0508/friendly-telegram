"""
API routers
"""
from app.routers import auth
from app.routers import services
from app.routers import quotes
from app.routers import appointments
from app.routers import contact
from app.routers import testimonials
from app.routers import admin

__all__ = [
    "auth",
    "services",
    "quotes",
    "appointments",
    "contact",
    "testimonials",
    "admin",
]
