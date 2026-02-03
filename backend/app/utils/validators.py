"""
Custom validators for API inputs
"""
import re
from typing import Optional
from fastapi import HTTPException, status
from math import radians, cos, sin, asin, sqrt

from app.config import settings


def validate_phone_number(phone: str) -> bool:
    """
    Validate phone number format
    Accepts various formats: +1234567890, (123) 456-7890, 123-456-7890, etc.
    """
    # Remove common formatting characters
    cleaned = re.sub(r'[\s\(\)\-\.]', '', phone)
    
    # Check if it contains only digits and optional + at start
    if not re.match(r'^\+?\d{10,15}$', cleaned):
        return False
    
    return True


def validate_postal_code(postal_code: str, country: str = "AU") -> bool:
    """
    Validate postal code format based on country
    Default: Australian postcodes (4 digits)
    """
    if country == "AU":
        return bool(re.match(r'^\d{4}$', postal_code))
    elif country == "US":
        return bool(re.match(r'^\d{5}(-\d{4})?$', postal_code))
    elif country == "UK":
        return bool(re.match(r'^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$', postal_code.upper()))
    
    return True  # Default to accept for other countries


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on earth (in kilometers)
    Using the Haversine formula
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    
    # Radius of earth in kilometers
    r = 6371
    
    return c * r


def is_in_service_area(latitude: float, longitude: float) -> tuple[bool, float]:
    """
    Check if a location is within the service area
    
    Returns:
        tuple: (is_in_area: bool, distance_km: float)
    """
    distance = calculate_distance(
        settings.SERVICE_AREA_CENTER_LAT,
        settings.SERVICE_AREA_CENTER_LNG,
        latitude,
        longitude
    )
    
    is_in_area = distance <= settings.SERVICE_AREA_RADIUS_KM
    
    return is_in_area, distance


def validate_service_area(latitude: float, longitude: float) -> dict:
    """
    Validate if coordinates are in service area and return details
    """
    is_in_area, distance = is_in_service_area(latitude, longitude)
    
    return {
        "in_service_area": is_in_area,
        "distance_km": round(distance, 2),
        "service_area_radius_km": settings.SERVICE_AREA_RADIUS_KM,
        "message": (
            f"Location is within our service area (within {settings.SERVICE_AREA_RADIUS_KM}km)"
            if is_in_area
            else f"Location is outside our service area ({round(distance, 2)}km from center, max {settings.SERVICE_AREA_RADIUS_KM}km)"
        )
    }


def validate_property_size(size: Optional[float]) -> bool:
    """
    Validate property size is reasonable
    Size should be between 50 sqm and 100,000 sqm (10 hectares)
    """
    if size is None:
        return True
    
    return 50 <= size <= 100000


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent directory traversal and other security issues
    """
    # Remove path components
    filename = filename.replace('/', '').replace('\\', '')
    
    # Remove special characters except dots, dashes, and underscores
    filename = re.sub(r'[^\w\s\-\.]', '', filename)
    
    # Replace spaces with underscores
    filename = filename.replace(' ', '_')
    
    # Limit length
    if len(filename) > 255:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        filename = name[:250] + ('.' + ext if ext else '')
    
    return filename


def validate_date_range(start_date, end_date) -> bool:
    """
    Validate that end_date is after start_date
    """
    if start_date and end_date:
        return end_date > start_date
    return True
