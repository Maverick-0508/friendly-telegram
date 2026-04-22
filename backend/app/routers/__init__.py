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
from app.routers import work_orders
from app.routers import task_items
from app.routers import field_logs
from app.routers import resource_plans
from app.routers import issue_notes
from app.routers import supervisor

__all__ = [
    "auth",
    "services",
    "quotes",
    "appointments",
    "contact",
    "testimonials",
    "admin",
    "work_orders",
    "task_items",
    "field_logs",
    "resource_plans",
    "issue_notes",
    "supervisor",
]
