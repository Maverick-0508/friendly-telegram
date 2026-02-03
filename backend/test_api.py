#!/usr/bin/env python3
"""
Simple test script to demonstrate AM Mowing API functionality
Run this script to test all major endpoints
"""
import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"
API_URL = f"{BASE_URL}/api"


def print_response(title, response):
    """Pretty print API response"""
    print(f"\n{'=' * 60}")
    print(f"{title}")
    print(f"{'=' * 60}")
    print(f"Status Code: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text}")


def main():
    print("AM Mowing API Test Script")
    print("=" * 60)
    
    # Test 1: Health Check
    print("\n1. Testing Health Check...")
    response = requests.get(f"{BASE_URL}/health")
    print_response("Health Check", response)
    
    # Test 2: Root Endpoint
    print("\n2. Testing Root Endpoint...")
    response = requests.get(BASE_URL)
    print_response("Root Endpoint", response)
    
    # Test 3: User Registration
    print("\n3. Testing User Registration...")
    user_data = {
        "email": "demo@ammowing.com",
        "password": "DemoPassword123!",
        "full_name": "Demo User",
        "phone": "555-0123"
    }
    response = requests.post(f"{API_URL}/auth/register", json=user_data)
    print_response("User Registration", response)
    
    # Test 4: User Login
    print("\n4. Testing User Login...")
    login_data = {
        "email": "demo@ammowing.com",
        "password": "DemoPassword123!"
    }
    response = requests.post(f"{API_URL}/auth/login/json", json=login_data)
    print_response("User Login", response)
    
    # Save token if login successful
    token = None
    if response.status_code == 200:
        token = response.json()["access_token"]
        print(f"\nAccess Token: {token[:50]}...")
    
    # Test 5: Contact Form Submission
    print("\n5. Testing Contact Form Submission...")
    contact_data = {
        "full_name": "Sarah Williams",
        "email": "sarah@example.com",
        "phone": "555-1111",
        "subject": "Service Inquiry",
        "service_type": "Lawn Mowing",
        "message": "I'm interested in your weekly lawn mowing service for my residential property."
    }
    response = requests.post(f"{API_URL}/contact", json=contact_data)
    print_response("Contact Form", response)
    
    # Test 6: Quote Request
    print("\n6. Testing Quote Request...")
    quote_data = {
        "full_name": "Michael Brown",
        "email": "michael@example.com",
        "phone": "555-2222",
        "address": "789 Park Lane, Sydney NSW 2000",
        "property_size": 750,
        "property_type": "residential",
        "service_type": "Full Lawn Care Package",
        "service_frequency": "bi-weekly",
        "additional_details": "Large front and back yard, needs regular maintenance"
    }
    response = requests.post(f"{API_URL}/quotes", json=quote_data)
    print_response("Quote Request", response)
    
    # Test 7: Appointment Booking
    print("\n7. Testing Appointment Booking...")
    future_date = (datetime.now() + timedelta(days=7)).replace(hour=10, minute=0, second=0, microsecond=0)
    appointment_data = {
        "full_name": "Emma Davis",
        "email": "emma@example.com",
        "phone": "555-3333",
        "service_type": "Lawn Treatment",
        "address": "321 Garden Road, Sydney NSW 2000",
        "scheduled_date": future_date.isoformat(),
        "duration_minutes": 120,
        "notes": "Please bring eco-friendly treatment products"
    }
    response = requests.post(f"{API_URL}/appointments", json=appointment_data)
    print_response("Appointment Booking", response)
    
    # Test 8: List Services
    print("\n8. Testing List Services...")
    response = requests.get(f"{API_URL}/services")
    print_response("List Services", response)
    
    # Test 9: Submit Testimonial
    print("\n9. Testing Testimonial Submission...")
    testimonial_data = {
        "customer_name": "David Wilson",
        "customer_email": "david@example.com",
        "customer_location": "North Sydney, NSW",
        "rating": 5.0,
        "title": "Outstanding Lawn Care Service",
        "content": "AM Mowing has transformed my lawn! Professional, reliable, and reasonably priced. Highly recommend!",
        "service_type": "Weekly Lawn Mowing"
    }
    response = requests.post(f"{API_URL}/testimonials", json=testimonial_data)
    print_response("Testimonial Submission", response)
    
    # Test 10: Get Testimonials
    print("\n10. Testing Get Approved Testimonials...")
    response = requests.get(f"{API_URL}/testimonials?approved_only=false")
    print_response("Get Testimonials", response)
    
    # Test 11: Get Current User (with auth)
    if token:
        print("\n11. Testing Get Current User (Protected Endpoint)...")
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{API_URL}/auth/me", headers=headers)
        print_response("Get Current User", response)
    
    print("\n" + "=" * 60)
    print("API Testing Complete!")
    print("=" * 60)
    print("\nTo explore more endpoints, visit:")
    print(f"- Swagger UI: {BASE_URL}/docs")
    print(f"- ReDoc: {BASE_URL}/redoc")


if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("\n" + "=" * 60)
        print("ERROR: Could not connect to the API server")
        print("=" * 60)
        print("\nMake sure the FastAPI server is running:")
        print("  cd backend")
        print("  uvicorn app.main:app --reload")
        print("\nThen run this script again.")
    except Exception as e:
        print(f"\nError: {str(e)}")
