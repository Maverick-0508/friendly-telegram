#!/usr/bin/env python3
"""
Seed script to populate the database with initial services data
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models.service import Service
from app.models.user import User, UserRole
from app.utils.auth import get_password_hash


def _is_truthy(value: str) -> bool:
    """Interpret common truthy string values from environment variables."""
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def create_admin_user(db):
    """Create or normalize default admin user."""
    admin_email = settings.ADMIN_EMAIL
    admin_password = os.getenv("ADMIN_SEED_PASSWORD", "Admin123!")
    reset_admin_password = _is_truthy(os.getenv("SEED_RESET_ADMIN_PASSWORD", "true"))

    existing_admin = db.query(User).filter(User.email == admin_email).first()

    if existing_admin is None:
        admin = User(
            email=admin_email,
            hashed_password=get_password_hash(admin_password),
            full_name="Admin User",
            phone="+254 758827319",
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True
        )
        db.add(admin)
        db.commit()
        print(f"✓ Created admin user: {admin_email}")
        print(f"  Password: {admin_password}")
    else:
        updated_fields = []

        if existing_admin.role != UserRole.ADMIN:
            existing_admin.role = UserRole.ADMIN
            updated_fields.append("role")
        if not existing_admin.is_active:
            existing_admin.is_active = True
            updated_fields.append("is_active")
        if not existing_admin.is_verified:
            existing_admin.is_verified = True
            updated_fields.append("is_verified")
        if reset_admin_password:
            existing_admin.hashed_password = get_password_hash(admin_password)
            updated_fields.append("hashed_password")

        if updated_fields:
            db.commit()
            print(f"✓ Updated admin user: {admin_email}")
            print(f"  Updated fields: {', '.join(updated_fields)}")
            if "hashed_password" in updated_fields:
                print(f"  Password reset to: {admin_password}")
        else:
            print(f"✓ Admin user already up to date: {admin_email}")


def seed_services(db):
    """Create or update initial services by slug."""
    services_data = [
        {
            "name": "Lawn Mowing",
            "slug": "lawn-mowing",
            "description": "Professional lawn mowing services for residential and commercial properties. We provide regular mowing schedules to keep your lawn looking pristine year-round.",
            "short_description": "Keep your lawn perfectly trimmed with our professional mowing service",
            "base_price": 50.00,
            "price_unit": "per service",
            "features": [
                "Regular mowing schedules",
                "Edge trimming",
                "Grass clipping removal",
                "Professional equipment",
                "Consistent cut height"
            ],
            "icon": "🌱",
            "is_active": True,
            "display_order": 1
        },
        {
            "name": "Landscape Design",
            "slug": "landscape-design",
            "description": "Transform your outdoor space with our expert landscape design services. From concept to completion, we create beautiful, functional landscapes tailored to your vision.",
            "short_description": "Custom landscape design to transform your outdoor space",
            "base_price": 500.00,
            "price_unit": "per project",
            "features": [
                "Custom design plans",
                "3D visualizations",
                "Plant selection",
                "Hardscape design",
                "Ongoing consultation"
            ],
            "icon": "🏡",
            "is_active": True,
            "display_order": 2
        },
        {
            "name": "Seasonal Maintenance",
            "slug": "seasonal-maintenance",
            "description": "Comprehensive seasonal lawn care including fertilization, aeration, overseeding, and pest control. Keep your lawn healthy through every season.",
            "short_description": "Year-round lawn care maintenance programs",
            "base_price": 150.00,
            "price_unit": "per visit",
            "features": [
                "Spring/fall cleanup",
                "Fertilization programs",
                "Aeration services",
                "Overseeding",
                "Pest and weed control"
            ],
            "icon": "🍂",
            "is_active": True,
            "display_order": 3
        },
        {
            "name": "Lawn Treatment",
            "slug": "lawn-treatment",
            "description": "Specialized lawn treatment services including fertilization, weed control, and pest management to ensure a healthy, vibrant lawn.",
            "short_description": "Professional lawn health treatments and fertilization",
            "base_price": 75.00,
            "price_unit": "per treatment",
            "features": [
                "Custom fertilization",
                "Weed control",
                "Disease prevention",
                "Soil testing",
                "Eco-friendly options"
            ],
            "icon": "💊",
            "is_active": True,
            "display_order": 4
        },
        {
            "name": "Hedge & Shrub Care",
            "slug": "hedge-shrub-care",
            "description": "Expert trimming and maintenance of hedges, shrubs, and ornamental plants. Keep your landscape features looking sharp and healthy.",
            "short_description": "Professional hedge trimming and shrub maintenance",
            "base_price": 80.00,
            "price_unit": "per service",
            "features": [
                "Precision trimming",
                "Shaping and styling",
                "Health assessments",
                "Debris removal",
                "Seasonal pruning"
            ],
            "icon": "✂️",
            "is_active": True,
            "display_order": 5
        },
        {
            "name": "Property Management",
            "slug": "property-management",
            "description": "Complete property management services for rental properties, commercial buildings, and estates. We handle all aspects of outdoor maintenance.",
            "short_description": "Comprehensive property management and maintenance",
            "base_price": 300.00,
            "price_unit": "per month",
            "features": [
                "Regular inspections",
                "Full lawn care",
                "Landscape maintenance",
                "Emergency services",
                "Detailed reporting"
            ],
            "icon": "🏢",
            "is_active": True,
            "display_order": 6
        }
    ]

    created_count = 0
    updated_count = 0

    for service_data in services_data:
        existing_service = db.query(Service).filter(Service.slug == service_data["slug"]).first()

        if existing_service is None:
            db.add(Service(**service_data))
            created_count += 1
            continue

        has_changes = False
        for field, value in service_data.items():
            if getattr(existing_service, field) != value:
                setattr(existing_service, field, value)
                has_changes = True

        if has_changes:
            updated_count += 1

    db.commit()
    print(f"✓ Services seeded: {created_count} created, {updated_count} updated")


def main():
    """Main seeding function"""
    print("=" * 60)
    print("AM Mowing Database Seeding")
    print("=" * 60)

    # Ensure all tables exist before seeding into a clean database.
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Create admin user
        print("\nCreating admin user...")
        create_admin_user(db)
        
        # Seed services
        print("\nSeeding services...")
        seed_services(db)
        
        print("\n" + "=" * 60)
        print("Database seeding completed successfully!")
        print("=" * 60)
        print("\nYou can now:")
        print(f"- Login as admin: {settings.ADMIN_EMAIL} / {os.getenv('ADMIN_SEED_PASSWORD', 'Admin123!')}")
        print("- View services at: http://localhost:8000/api/services")
        print("- Access admin dashboard at: http://localhost:8000/api/admin/stats")
        
    except Exception as e:
        print(f"\n✗ Error during seeding: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
