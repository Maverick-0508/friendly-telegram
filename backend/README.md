# AM Mowing - FastAPI Backend

A comprehensive FastAPI backend for the AM Mowing professional lawn care website, providing all essential functionalities for managing a lawn care business.

## Features

### Core Functionalities

- **Authentication & Authorization**
  - JWT-based authentication
  - User registration and login
  - Role-based access control (Customer, Admin)
  - Password hashing with bcrypt
  - Token refresh mechanism

- **Contact Form Management**
  - Submit and manage contact form submissions
  - Email notifications for new submissions
  - Admin dashboard for tracking responses

- **Quote Request System**
  - Request and manage service quotes
  - Quote status tracking (pending, reviewed, quoted, accepted, rejected)
  - Property details and service preferences
  - Email confirmations

- **Appointment Scheduling**
  - Book and manage appointments
  - Multiple status tracking
  - Calendar integration support
  - Email confirmations

- **Service Management**
  - CRUD operations for lawn care services
  - Service pricing and features
  - Active/inactive status management

- **Testimonial Management**
  - Customer testimonial submission
  - Admin approval workflow
  - Featured testimonials

- **Service Area Validation**
  - Geographic boundary checking
  - Distance calculation from central location
  - Support for coordinates validation

- **Admin Dashboard**
  - Comprehensive statistics
  - Conversion rates tracking
  - Pending items overview
  - Activity metrics

## Installation

### Prerequisites

- Python 3.8 or higher
- PostgreSQL (recommended for production) or SQLite (for development)
- pip (Python package installer)

### Setup Steps

1. **Clone the repository**
   ```bash
   cd backend
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Configuration**
   
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure your settings:
   - Set a strong `SECRET_KEY` for JWT
   - Configure database connection (`DATABASE_URL`)
   - Set up SMTP credentials for email functionality
   - Adjust CORS origins for your frontend

5. **Initialize the database**
   
   The application will automatically create tables on first run. For SQLite (development):
   ```bash
   # The database file will be created automatically
   ```
   
   For PostgreSQL (production):
   ```bash
   # Create database first
   createdb ammowing_db
   ```

6. **Run the application**
   ```bash
   # Development mode with auto-reload
   python -m app.main
   
   # Or using uvicorn directly
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

7. **Access the API documentation**
   - Swagger UI: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with OAuth2 form
- `POST /api/auth/login/json` - Login with JSON payload
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/refresh` - Refresh access token

### Services
- `GET /api/services` - List all services
- `GET /api/services/{id}` - Get service details
- `POST /api/services` - Create service (admin only)
- `PUT /api/services/{id}` - Update service (admin only)
- `DELETE /api/services/{id}` - Delete service (admin only)

### Quotes
- `POST /api/quotes` - Request a quote
- `GET /api/quotes` - Get all quotes (admin only)
- `GET /api/quotes/{id}` - Get specific quote
- `PUT /api/quotes/{id}` - Update quote status (admin only)
- `DELETE /api/quotes/{id}` - Delete quote (admin only)

### Appointments
- `POST /api/appointments` - Book an appointment
- `GET /api/appointments` - Get all appointments (admin only)
- `GET /api/appointments/user/{user_id}` - Get user's appointments
- `PUT /api/appointments/{id}` - Update appointment
- `DELETE /api/appointments/{id}` - Cancel appointment

### Contact
- `POST /api/contact` - Submit contact form
- `GET /api/contact` - Get all submissions (admin only)
- `GET /api/contact/{id}` - Get specific submission (admin only)
- `PUT /api/contact/{id}/mark-replied` - Mark as replied (admin only)

### Testimonials
- `GET /api/testimonials` - Get approved testimonials
- `POST /api/testimonials` - Submit testimonial
- `PUT /api/testimonials/{id}` - Update testimonial (admin only)
- `POST /api/testimonials/{id}/approve` - Approve testimonial (admin only)
- `POST /api/testimonials/{id}/feature` - Feature testimonial (admin only)
- `DELETE /api/testimonials/{id}` - Delete testimonial (admin only)

### Admin
- `GET /api/admin/stats` - Get dashboard statistics (admin only)
- `GET /api/admin/service-area/check` - Check service area coverage

## Database Models

### User
- Email, password, full name, phone
- Role (customer/admin)
- Active status and verification

### Service
- Name, description, pricing
- Features and icons
- Display order and active status

### Quote
- Customer information
- Property details
- Service requirements
- Status tracking

### Appointment
- Scheduling information
- Service type
- Status tracking
- Duration and notes

### Contact
- Customer inquiry details
- Read/replied status
- Timestamps

### Testimonial
- Customer feedback
- Rating (1-5 stars)
- Approval and featured status

## Security

- **Password Hashing**: bcrypt with configurable rounds
- **JWT Tokens**: Secure token-based authentication
- **CORS**: Configurable cross-origin resource sharing
- **Input Validation**: Pydantic schemas for all inputs
- **SQL Injection Prevention**: SQLAlchemy ORM
- **Rate Limiting**: Configurable API rate limits

## Email Configuration

The application sends email notifications for:
- New user registration (welcome email)
- Contact form submissions (admin notification)
- Quote requests (confirmation to customer)
- Appointment bookings (confirmation to customer)

Configure SMTP settings in `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@ammowing.com
ADMIN_EMAIL=admin@ammowing.com
```

**Note**: For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

## Development

### Project Structure
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   ├── database.py          # Database connection
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic schemas
│   ├── routers/             # API routes
│   ├── utils/               # Utility functions
│   └── middleware/          # Middleware (CORS, etc.)
├── requirements.txt
├── .env.example
└── README.md
```

### Running Tests

Tests can be added in a `tests/` directory. Example structure:
```bash
pytest tests/
```

### Code Style

The project follows PEP 8 guidelines. Use tools like:
```bash
# Format code
black app/

# Lint code
flake8 app/

# Type checking
mypy app/
```

## Production Deployment

### Using Docker

Create a `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t ammowing-backend .
docker run -p 8000:8000 --env-file .env ammowing-backend
```

### Environment Variables

Ensure all production environment variables are set:
- Use a strong, random `SECRET_KEY`
- Set `DEBUG=False`
- Configure production database
- Set up proper CORS origins
- Configure production SMTP settings

### Database Migrations

For production, use Alembic for database migrations:
```bash
# Initialize Alembic
alembic init alembic

# Create migration
alembic revision --autogenerate -m "Initial migration"

# Apply migration
alembic upgrade head
```

## Support

For issues or questions:
- Check the API documentation at `/docs`
- Review error messages in the response
- Check application logs
- Contact: admin@ammowing.com

## License

© 2026 AM Mowing. All rights reserved.
