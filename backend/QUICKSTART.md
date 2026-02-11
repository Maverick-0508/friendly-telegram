# AM Mowing Backend - Quick Start Guide

This guide will help you get the AM Mowing FastAPI backend up and running quickly.

## Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

## Quick Setup (5 minutes)

### 1. Navigate to the backend directory
```bash
cd backend
```

### 2. Create a virtual environment (recommended)
```bash
python -m venv venv

# Activate on Windows
venv\Scripts\activate

# Activate on macOS/Linux
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and set your SECRET_KEY (required)
# The default configuration uses SQLite, which requires no additional setup
```

**Important**: Generate a secure SECRET_KEY for production:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. Start the server
```bash
# Development mode with auto-reload
uvicorn app.main:app --reload

# Or using the module directly
python -m uvicorn app.main:app --reload
```

The server will start at: **http://localhost:8000**

### 6. Access the API documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI Schema**: http://localhost:8000/openapi.json

## Quick Test

Test the API is running:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"healthy","version":"1.0.0"}
```

## API Endpoints Overview

### Public Endpoints (No authentication required)

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login
- `POST /api/contact` - Submit contact form
- `POST /api/quotes` - Request a quote
- `POST /api/appointments` - Book an appointment
- `GET /api/services` - List all services
- `GET /api/testimonials` - Get approved testimonials
- `POST /api/testimonials` - Submit a testimonial

### Protected Endpoints (Authentication required)

- `GET /api/auth/me` - Get current user profile
- `GET /api/quotes/{id}` - Get specific quote
- `GET /api/appointments/user/{user_id}` - Get user's appointments

### Admin Only Endpoints

- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/contact` - Get all contact submissions
- `POST /api/services` - Create service
- `PUT /api/quotes/{id}` - Update quote status
- `POST /api/testimonials/{id}/approve` - Approve testimonial

## Example API Calls

### Register a new user
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "full_name": "John Doe",
    "phone": "1234567890"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login/json \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

### Submit contact form
```bash
curl -X POST http://localhost:8000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "555-1234",
    "subject": "Inquiry",
    "service_type": "Lawn Mowing",
    "message": "I would like to know more about your services."
  }'
```

### Request a quote
```bash
curl -X POST http://localhost:8000/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Bob Johnson",
    "email": "bob@example.com",
    "phone": "555-5678",
    "address": "123 Main St, Sydney NSW 2000",
    "property_size": 500,
    "service_type": "Lawn Mowing",
    "service_frequency": "weekly"
  }'
```

## Database

By default, the application uses SQLite (a file-based database) which requires no setup. The database file `ammowing.db` will be created automatically in the backend directory.

For production, switch to PostgreSQL by updating the `DATABASE_URL` in your `.env` file:
```
DATABASE_URL=postgresql://user:password@localhost:5432/ammowing_db
```

## Email Configuration

To enable email notifications, configure SMTP settings in `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@ammowing.com
ADMIN_EMAIL=admin@ammowing.com
```

**Note**: For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

## CORS Configuration

To allow requests from your frontend, update `CORS_ORIGINS` in `.env`:
```
CORS_ORIGINS=http://localhost:3000,http://localhost:8080,https://yourdomain.com
```

## Creating an Admin User

After registering a regular user, you can manually update their role to admin in the database:

### SQLite
```bash
sqlite3 ammowing.db
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
.quit
```

### PostgreSQL
```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

## Troubleshooting

### Port already in use
If port 8000 is already in use, specify a different port:
```bash
uvicorn app.main:app --reload --port 8001
```

### Module not found errors
Make sure you're in the backend directory and your virtual environment is activated:
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Database errors
Delete the database file and restart to recreate tables:
```bash
rm ammowing.db
uvicorn app.main:app --reload
```

## Production Deployment

For production deployment, see the full [README.md](README.md) for detailed instructions on:
- Using PostgreSQL
- Environment security
- Docker deployment
- HTTPS configuration
- Database migrations with Alembic

## Next Steps

1. Explore the interactive API documentation at http://localhost:8000/docs
2. Test all endpoints using the Swagger UI
3. Create some sample services, quotes, and appointments
4. Configure email notifications
5. Set up admin access
6. Integrate with your frontend application

## Support

For detailed documentation, see [README.md](README.md)

For issues or questions, refer to the API documentation at `/docs`
