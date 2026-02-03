# AM Mowing API Endpoints Reference

Complete reference of all available API endpoints.

Base URL: `http://localhost:8000`
API Version 1: `/api`

---

## Authentication Endpoints

### Register User
**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "full_name": "John Doe",
  "phone": "1234567890"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "phone": "1234567890",
  "role": "customer",
  "is_active": true,
  "is_verified": false,
  "created_at": "2026-02-03T20:00:00",
  "last_login": null
}
```

---

### Login (OAuth2 Form)
**POST** `/api/auth/login`

Login using OAuth2 password flow (form data).

**Request (Form Data):**
- `username`: email address
- `password`: password

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "bearer"
}
```

---

### Login (JSON)
**POST** `/api/auth/login/json`

Login using JSON payload.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** Same as OAuth2 login

---

### Get Current User
**GET** `/api/auth/me`

Get currently authenticated user information.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK` - User object

---

### Refresh Token
**POST** `/api/auth/refresh`

Refresh access token.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK` - New token pair

---

## Service Endpoints

### List Services
**GET** `/api/services`

Get all services.

**Query Parameters:**
- `skip`: Offset for pagination (default: 0)
- `limit`: Number of results (default: 100)
- `active_only`: Filter active services (default: true)

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "name": "Lawn Mowing",
    "slug": "lawn-mowing",
    "description": "Professional lawn mowing...",
    "short_description": "Keep your lawn trimmed",
    "base_price": 50.0,
    "price_unit": "per service",
    "features": ["Regular mowing", "Edge trimming"],
    "icon": "🌱",
    "is_active": true,
    "display_order": 1,
    "created_at": "2026-02-03T20:00:00",
    "updated_at": null
  }
]
```

---

### Get Service by ID
**GET** `/api/services/{service_id}`

Get specific service details.

**Response:** `200 OK` - Service object

---

### Get Service by Slug
**GET** `/api/services/slug/{slug}`

Get service by URL slug.

**Response:** `200 OK` - Service object

---

### Create Service (Admin)
**POST** `/api/services`

Create a new service. **Admin only**.

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "name": "New Service",
  "slug": "new-service",
  "description": "Service description...",
  "short_description": "Short desc",
  "base_price": 75.0,
  "price_unit": "per service",
  "features": ["Feature 1", "Feature 2"],
  "icon": "🌿",
  "is_active": true,
  "display_order": 7
}
```

**Response:** `201 Created` - Service object

---

### Update Service (Admin)
**PUT** `/api/services/{service_id}`

Update existing service. **Admin only**.

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:** Partial service data (only fields to update)

**Response:** `200 OK` - Updated service object

---

### Delete Service (Admin)
**DELETE** `/api/services/{service_id}`

Delete a service. **Admin only**.

**Headers:** `Authorization: Bearer <admin_token>`

**Response:** `204 No Content`

---

## Quote Endpoints

### Request Quote
**POST** `/api/quotes`

Submit a quote request.

**Request Body:**
```json
{
  "full_name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "555-5678",
  "address": "123 Main St, Sydney NSW 2000",
  "property_size": 500,
  "property_type": "residential",
  "service_type": "Lawn Mowing",
  "service_frequency": "weekly",
  "preferred_start_date": "2026-03-01T00:00:00",
  "additional_details": "Large backyard"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "user_id": null,
  "full_name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "555-5678",
  "address": "123 Main St, Sydney NSW 2000",
  "property_size": 500.0,
  "property_type": "residential",
  "service_type": "Lawn Mowing",
  "service_frequency": "weekly",
  "preferred_start_date": "2026-03-01T00:00:00",
  "additional_details": "Large backyard",
  "property_photos": null,
  "status": "pending",
  "quoted_price": null,
  "quote_notes": null,
  "created_at": "2026-02-03T20:00:00",
  "updated_at": null,
  "reviewed_at": null
}
```

---

### List Quotes (Admin)
**GET** `/api/quotes`

Get all quotes. **Admin only**.

**Headers:** `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `skip`: Offset (default: 0)
- `limit`: Limit (default: 100)
- `status_filter`: Filter by status

**Response:** `200 OK` - Array of quotes

---

### Get Quote
**GET** `/api/quotes/{quote_id}`

Get specific quote. Users can only see their own quotes.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK` - Quote object

---

### Update Quote (Admin)
**PUT** `/api/quotes/{quote_id}`

Update quote. **Admin only**.

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "status": "quoted",
  "quoted_price": 200.0,
  "quote_notes": "Includes weekly service"
}
```

**Response:** `200 OK` - Updated quote

---

### Delete Quote (Admin)
**DELETE** `/api/quotes/{quote_id}`

Delete quote. **Admin only**.

**Response:** `204 No Content`

---

### Get User Quotes
**GET** `/api/quotes/user/{user_id}`

Get all quotes for a user.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK` - Array of quotes

---

## Appointment Endpoints

### Book Appointment
**POST** `/api/appointments`

Book a new appointment.

**Request Body:**
```json
{
  "full_name": "Bob Johnson",
  "email": "bob@example.com",
  "phone": "555-9999",
  "service_type": "Lawn Maintenance",
  "address": "456 Oak Ave, Sydney NSW 2000",
  "scheduled_date": "2026-02-15T10:00:00",
  "duration_minutes": 90,
  "notes": "Please call before arriving"
}
```

**Response:** `201 Created` - Appointment object

---

### List Appointments (Admin)
**GET** `/api/appointments`

Get all appointments. **Admin only**.

**Query Parameters:**
- `skip`, `limit`, `status_filter`

**Response:** `200 OK` - Array of appointments

---

### Get User Appointments
**GET** `/api/appointments/user/{user_id}`

Get user's appointments.

**Response:** `200 OK` - Array of appointments

---

### Get Appointment
**GET** `/api/appointments/{appointment_id}`

Get specific appointment.

**Response:** `200 OK` - Appointment object

---

### Update Appointment
**PUT** `/api/appointments/{appointment_id}`

Update appointment.

**Request Body:**
```json
{
  "status": "confirmed",
  "admin_notes": "Confirmed with customer"
}
```

**Response:** `200 OK` - Updated appointment

---

### Delete Appointment
**DELETE** `/api/appointments/{appointment_id}`

Cancel/delete appointment.

**Response:** `204 No Content`

---

## Contact Endpoints

### Submit Contact Form
**POST** `/api/contact`

Submit a contact form.

**Request Body:**
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone": "555-1234",
  "subject": "Lawn Mowing Inquiry",
  "service_type": "Lawn Mowing",
  "message": "I would like to inquire about your services."
}
```

**Response:** `201 Created` - Contact object

---

### List Contacts (Admin)
**GET** `/api/contact`

Get all contact submissions. **Admin only**.

**Query Parameters:**
- `skip`, `limit`, `unread_only`

**Response:** `200 OK` - Array of contacts

---

### Get Contact (Admin)
**GET** `/api/contact/{contact_id}`

Get specific contact. **Admin only**. Marks as read.

**Response:** `200 OK` - Contact object

---

### Mark Contact Replied (Admin)
**PUT** `/api/contact/{contact_id}/mark-replied`

Mark contact as replied. **Admin only**.

**Response:** `200 OK` - Updated contact

---

### Delete Contact (Admin)
**DELETE** `/api/contact/{contact_id}`

Delete contact. **Admin only**.

**Response:** `204 No Content`

---

## Testimonial Endpoints

### List Testimonials
**GET** `/api/testimonials`

Get testimonials.

**Query Parameters:**
- `skip`, `limit`
- `approved_only` (default: true)
- `featured_only` (default: false)

**Response:** `200 OK` - Array of testimonials

---

### Get Testimonial
**GET** `/api/testimonials/{testimonial_id}`

Get specific testimonial.

**Response:** `200 OK` - Testimonial object

---

### Submit Testimonial
**POST** `/api/testimonials`

Submit a new testimonial.

**Request Body:**
```json
{
  "customer_name": "Alice Brown",
  "customer_email": "alice@example.com",
  "customer_location": "Sydney, NSW",
  "rating": 5.0,
  "title": "Excellent Service!",
  "content": "AM Mowing did an amazing job...",
  "service_type": "Lawn Mowing"
}
```

**Response:** `201 Created` - Testimonial (is_approved: false)

---

### Update Testimonial (Admin)
**PUT** `/api/testimonials/{testimonial_id}`

Update testimonial. **Admin only**.

**Response:** `200 OK` - Updated testimonial

---

### Approve Testimonial (Admin)
**POST** `/api/testimonials/{testimonial_id}/approve`

Approve testimonial. **Admin only**.

**Response:** `200 OK` - Approved testimonial

---

### Feature Testimonial (Admin)
**POST** `/api/testimonials/{testimonial_id}/feature`

Feature testimonial. **Admin only**. Also approves if not approved.

**Response:** `200 OK` - Featured testimonial

---

### Delete Testimonial (Admin)
**DELETE** `/api/testimonials/{testimonial_id}`

Delete testimonial. **Admin only**.

**Response:** `204 No Content`

---

## Admin Endpoints

### Get Dashboard Stats (Admin)
**GET** `/api/admin/stats`

Get comprehensive dashboard statistics. **Admin only**.

**Headers:** `Authorization: Bearer <admin_token>`

**Response:** `200 OK`
```json
{
  "totals": {
    "quotes": 10,
    "appointments": 8,
    "contacts": 15,
    "testimonials": 5,
    "users": 20
  },
  "pending": {
    "quotes": 3,
    "testimonials": 2,
    "contacts": 5
  },
  "appointments": {
    "scheduled": 3,
    "confirmed": 2,
    "completed": 3
  },
  "quotes_by_status": {
    "pending": 3,
    "reviewed": 2,
    "quoted": 3,
    "accepted": 2,
    "rejected": 0
  },
  "recent_activity": {
    "quotes": 5,
    "appointments": 4,
    "contacts": 7
  },
  "metrics": {
    "conversion_rate": 20.0,
    "average_rating": 4.8
  }
}
```

---

### Check Service Area
**GET** `/api/admin/service-area/check`

Check if coordinates are within service area.

**Query Parameters:**
- `latitude`: Latitude coordinate
- `longitude`: Longitude coordinate

**Response:** `200 OK`
```json
{
  "in_service_area": true,
  "distance_km": 12.5,
  "service_area_radius_km": 50,
  "message": "Location is within our service area (within 50km)"
}
```

---

**POST** `/api/admin/service-area/check`

Check service area (POST version).

**Request Body:**
```json
{
  "latitude": -33.8688,
  "longitude": 151.2093
}
```

**Response:** Same as GET version

---

## Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created
- `204 No Content` - Deletion successful
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation error

---

## Authentication

Include JWT token in requests:
```
Authorization: Bearer <your_access_token>
```

Access tokens expire in 30 minutes.
Refresh tokens expire in 7 days.

---

## Rate Limiting

Default: 60 requests per minute per IP address.

---

For interactive documentation, visit: `http://localhost:8000/docs`
