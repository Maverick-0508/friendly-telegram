# AM Mowing - Professional Lawn Care Platform

A comprehensive lawn care platform combining a beautiful static website with a powerful FastAPI backend for AM Mowing services.

## 🌟 Project Structure

This repository contains two main components organized in separate directories:

```
friendly-telegram/
├── frontend/          # Static website files
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── backend/           # FastAPI backend
│   ├── app/
│   ├── requirements.txt
│   └── ...
└── README.md
```

### Frontend (Static Website)
A beautiful, modern website with smooth animations and responsive design.
Located in the `frontend/` directory.

### Backend (FastAPI)
A comprehensive REST API for managing lawn care business operations.
Located in the `backend/` directory.

## Features

### Frontend Features
- **Modern Design**: Beautiful gradient hero section with smooth animations
- **Responsive Layout**: Mobile-first design that works on all devices
- **Interactive Elements**: Smooth scrolling, hover effects, and dynamic animations
- **Contact Form**: Functional form with validation and success feedback
- **Service Showcase**: Detailed presentation of all lawn care services
- **Customer Testimonials**: Social proof with 5-star reviews
- **Performance Optimized**: Fast loading and smooth scroll performance

### Backend Features
- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Contact Form Management**: Handle and track customer inquiries
- **Quote Request System**: Manage service quotes with status tracking
- **Appointment Scheduling**: Book and manage service appointments
- **Service Management**: CRUD operations for lawn care services
- **Testimonial Management**: Customer reviews with approval workflow
- **Admin Dashboard**: Comprehensive statistics and analytics
- **Service Area Validation**: Geographic boundary checking
- **Email Notifications**: Automated emails for key events
- **API Documentation**: Auto-generated Swagger/OpenAPI docs

## Quick Start

### Frontend (Static Website)

Simply open `frontend/index.html` in a web browser to view the website.

For development with live reload:
```bash
cd frontend
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080`

### Backend (FastAPI)

See [backend/QUICKSTART.md](backend/QUICKSTART.md) for detailed setup instructions.

Quick setup:
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set SECRET_KEY
uvicorn app.main:app --reload
```

API Documentation: http://localhost:8000/docs

## Technologies Used

### Frontend
- HTML5 - Semantic markup
- CSS3 - Modern styling with animations
- JavaScript (ES6+) - Interactive features
- Google Fonts - Professional typography
- Leaflet - Interactive maps

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLAlchemy ORM with SQLite/PostgreSQL
- **Authentication**: JWT with bcrypt password hashing
- **Email**: Async SMTP with aiosmtplib
- **Validation**: Pydantic schemas
- **Documentation**: Auto-generated OpenAPI/Swagger

## Documentation

- **Backend Setup**: [backend/README.md](backend/README.md)
- **Quick Start Guide**: [backend/QUICKSTART.md](backend/QUICKSTART.md)
- **API Documentation**: http://localhost:8000/docs (when server is running)

## License

© 2026 AM Mowing. All rights reserved.
