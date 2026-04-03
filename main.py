from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional
import json
from datetime import datetime

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

# Routes
@app.get("/")
def read_root():
    return {
        "message": "Welcome to Friendly Telegram API",
        "version": "0.1.0",
        "docs": "/docs"
    }

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
