# Lawn Craft - Professional Lawn Care Platform

A comprehensive lawn care platform combining a beautiful static website with a powerful FastAPI backend for Lawn Craft services.

## 🌟 Project Structure

This repository contains two main components organized in separate directories:

```
friendly-telegram/
├── frontend/          # Static website files
│   ├── index.html
│   ├── services.html
│   ├── insights.html
│   ├── about.html
│   ├── service-area.html
│   ├── process.html
│   ├── contact.html
│   ├── styles.css
│   └── script.js
├── backend/           # FastAPI backend
│   ├── app/
│   ├── requirements.txt
│   └── ...
└── README.md
```

### Frontend (Static Multi-Page Website)
A modern multi-page website with responsive layouts and shared styling/scripts.
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

From a local server, open `/home` (or `/`) in a web browser to start from the home page and navigate to dedicated pages for services, insights, about, service area, process, and contact.

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

### Frontend → automatic-spoon backend forwarding

For deployed frontend contact submissions, configure the Vercel environment variable in this repo:

- `CONTACT_BACKEND_API_URL` (preferred), or
- `AUTOMATIC_SPOON_API_URL`, or
- `AUTOMATIC_SPOON_BACKEND_URL`

Set it to the backend deployment base URL from the `automatic-spoon` repo. The `/api/contact` function in this repository forwards requests to `${BASE_URL}/api/contact`.

### Contact form production integration checklist

Use this checklist when contact submissions are not appearing in backend/admin views:

1. **Confirm request path**
   - Frontend submits to same-origin `POST /api/contact` (`frontend/script.js`).
   - Vercel Python function entrypoint is `api/contact.py`.
   - Backend intake endpoint is `POST /api/contact`.

2. **Set forwarding env vars in Vercel**
   - Set `CONTACT_BACKEND_API_URL` to the deployed backend base URL.
   - Remove stale/conflicting fallback keys (`AUTOMATIC_SPOON_API_URL`, `AUTOMATIC_SPOON_BACKEND_URL`, etc.) unless intentionally used.
   - Ensure Production and Preview environments point to the correct backend deployments.

3. **Validate backend database target**
   - Ensure Render backend has the correct `DATABASE_URL`.
   - Ensure the `contacts` table exists in that database.
   - Ensure production-like environments are not writing to an unintended local fallback DB.

4. **Check network controls**
   - If DB/network access is IP-restricted, allow Render outbound CIDRs:
     - `74.220.48.0/24`
     - `74.220.56.0/24`
   - Keep DB authentication/TLS enabled even when allowlisting is in place.

5. **Run production verification**
   - Submit a live contact form.
   - Confirm backend logs show `POST /api/contact`.
   - Confirm a new row in `contacts` and expected work-order/audit side-effects.
   - Confirm contact appears in admin retrieval/dashboard flows.

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

© 2026 Lawn Craft. All rights reserved.
