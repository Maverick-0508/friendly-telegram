from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from typing import Optional
import json
from datetime import datetime

FRONTEND_DIR = Path(__file__).parent / "frontend"
if not FRONTEND_DIR.is_dir():
    raise RuntimeError(f"Frontend directory not found: {FRONTEND_DIR}")


def _page(filename: str) -> FileResponse:
    """Return a FileResponse for a frontend HTML page, or raise 404 if missing."""
    path = FRONTEND_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(str(path))

app = FastAPI(
    title="Friendly Telegram API",
    description="API for Friendly Telegram lawn care services",
    version="0.1.0"
)

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Models
class ContactForm(BaseModel):
    name: str
    email: EmailStr
    phone: str
    service: str
    message: str

class Service(BaseModel):
    id: int
    name: str
    description: str
    price: Optional[str] = None

# In-memory storage (replace with database for production)
contacts = []

# Page routes
@app.get("/")
def index_page():
    return _page("index.html")

@app.get("/services")
def services_page():
    return _page("services.html")

@app.get("/insights")
def insights_page():
    return _page("insights.html")

@app.get("/contact")
def contact_page():
    return _page("contact.html")

@app.get("/process")
def process_page():
    return _page("process.html")

@app.get("/about")
def about_page():
    return _page("about.html")

@app.get("/service-area")
def service_area_page():
    return _page("service-area.html")

@app.get("/api/services", response_model=list[Service])
def get_services():
    """Get all available lawn care services"""
    services = [
        {
            "id": 1,
            "name": "Lawn Mowing",
            "description": "Professional lawn mowing with precision cutting and edging"
        },
        {
            "id": 2,
            "name": "Landscaping",
            "description": "Beautiful landscape design and installation"
        },
        {
            "id": 3,
            "name": "Weed Control",
            "description": "Effective weed removal and prevention"
        },
        {
            "id": 4,
            "name": "Fertilization",
            "description": "Customized lawn fertilization programs"
        },
        {
            "id": 5,
            "name": "Aeration",
            "description": "Soil aeration to promote healthy grass growth"
        },
        {
            "id": 6,
            "name": "Seasonal Cleanup",
            "description": "Spring and fall cleanup services"
        }
    ]
    return services

@app.post("/api/contact")
def submit_contact_form(contact: ContactForm):
    """Submit a contact form inquiry"""
    contact_data = {
        "timestamp": datetime.now().isoformat(),
        **contact.dict()
    }
    contacts.append(contact_data)
    
    return {
        "status": "success",
        "message": "Thank you for your inquiry! We'll get back to you soon.",
        "id": len(contacts)
    }

@app.get("/api/contacts")
def get_contacts():
    """Get all submitted contacts (admin endpoint)"""
    return contacts

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

# Serve frontend static assets (CSS, JS, images) at /frontend/*
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
