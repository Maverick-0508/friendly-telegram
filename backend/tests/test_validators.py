"""
Unit tests for app/utils/validators.py.

These test pure-logic functions with no database or HTTP involvement.
"""
import pytest
from app.utils.validators import (
    validate_phone_number,
    validate_postal_code,
    calculate_distance,
    is_in_service_area,
    validate_service_area,
    validate_property_size,
    sanitize_filename,
    validate_date_range,
)
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# validate_phone_number
# ---------------------------------------------------------------------------

class TestValidatePhoneNumber:
    def test_valid_international_number(self):
        assert validate_phone_number("+254 758827319") is True

    def test_valid_local_number_no_plus(self):
        assert validate_phone_number("0412345678") is True

    def test_valid_number_with_dashes(self):
        assert validate_phone_number("+1-800-555-0100") is True

    def test_valid_number_with_parens(self):
        assert validate_phone_number("+1 (800) 555-0100") is True

    def test_invalid_too_short(self):
        assert validate_phone_number("12345") is False

    def test_invalid_letters_present(self):
        assert validate_phone_number("abc-def-ghij") is False

    def test_invalid_empty_string(self):
        assert validate_phone_number("") is False

    def test_valid_e164_long_number(self):
        # 15 digits after stripping – maximum
        assert validate_phone_number("+123456789012345") is True

    def test_invalid_too_long(self):
        # 16 digits – over limit
        assert validate_phone_number("+1234567890123456") is False


# ---------------------------------------------------------------------------
# validate_postal_code
# ---------------------------------------------------------------------------

class TestValidatePostalCode:
    def test_valid_au_postcode(self):
        assert validate_postal_code("2000", "AU") is True

    def test_invalid_au_postcode_letters(self):
        assert validate_postal_code("AB12", "AU") is False

    def test_invalid_au_postcode_too_short(self):
        assert validate_postal_code("200", "AU") is False

    def test_invalid_au_postcode_too_long(self):
        assert validate_postal_code("20000", "AU") is False

    def test_valid_us_zip5(self):
        assert validate_postal_code("90210", "US") is True

    def test_valid_us_zip9(self):
        assert validate_postal_code("90210-1234", "US") is True

    def test_invalid_us_zip(self):
        assert validate_postal_code("9021", "US") is False

    def test_valid_uk_postcode(self):
        assert validate_postal_code("SW1A 1AA", "UK") is True

    def test_unknown_country_accepts_any(self):
        # Unknown country code → default True
        assert validate_postal_code("anything", "ZZ") is True


# ---------------------------------------------------------------------------
# calculate_distance
# ---------------------------------------------------------------------------

class TestCalculateDistance:
    def test_same_point_is_zero(self):
        dist = calculate_distance(-33.8688, 151.2093, -33.8688, 151.2093)
        assert dist == pytest.approx(0.0, abs=0.001)

    def test_sydney_to_melbourne_approx(self):
        # Sydney CBD to Melbourne CBD ≈ 713 km
        dist = calculate_distance(-33.8688, 151.2093, -37.8136, 144.9631)
        assert 700 < dist < 730

    def test_result_is_symmetric(self):
        d1 = calculate_distance(-33.8688, 151.2093, -37.8136, 144.9631)
        d2 = calculate_distance(-37.8136, 144.9631, -33.8688, 151.2093)
        assert d1 == pytest.approx(d2, rel=1e-6)


# ---------------------------------------------------------------------------
# is_in_service_area
# ---------------------------------------------------------------------------

class TestIsInServiceArea:
    def test_centre_point_is_in_area(self):
        in_area, dist = is_in_service_area(-33.8688, 151.2093)
        assert in_area is True
        assert dist == pytest.approx(0.0, abs=0.01)

    def test_distant_point_is_outside(self):
        # Melbourne is outside the 50 km radius around Sydney
        in_area, dist = is_in_service_area(-37.8136, 144.9631)
        assert in_area is False
        assert dist > 50


# ---------------------------------------------------------------------------
# validate_service_area
# ---------------------------------------------------------------------------

class TestValidateServiceArea:
    def test_inside_area_returns_correct_dict(self):
        result = validate_service_area(-33.8688, 151.2093)
        assert result["in_service_area"] is True
        assert "distance_km" in result
        assert "message" in result
        assert "within" in result["message"].lower()

    def test_outside_area_returns_correct_dict(self):
        result = validate_service_area(-37.8136, 144.9631)
        assert result["in_service_area"] is False
        assert "outside" in result["message"].lower()
        assert result["distance_km"] > 50


# ---------------------------------------------------------------------------
# validate_property_size
# ---------------------------------------------------------------------------

class TestValidatePropertySize:
    def test_none_is_valid(self):
        assert validate_property_size(None) is True

    def test_minimum_boundary(self):
        assert validate_property_size(50) is True

    def test_below_minimum(self):
        assert validate_property_size(49) is False

    def test_maximum_boundary(self):
        assert validate_property_size(100000) is True

    def test_above_maximum(self):
        assert validate_property_size(100001) is False

    def test_typical_residential_size(self):
        assert validate_property_size(600) is True


# ---------------------------------------------------------------------------
# sanitize_filename
# ---------------------------------------------------------------------------

class TestSanitizeFilename:
    def test_removes_path_separators(self):
        result = sanitize_filename("../../etc/passwd")
        assert "/" not in result
        assert "\\" not in result

    def test_replaces_spaces_with_underscores(self):
        result = sanitize_filename("my file name.txt")
        assert " " not in result
        assert "_" in result

    def test_removes_special_characters(self):
        result = sanitize_filename("file<>:name?.txt")
        assert "<" not in result
        assert ">" not in result
        assert "?" not in result

    def test_normal_filename_unchanged(self):
        result = sanitize_filename("my_photo.jpg")
        assert result == "my_photo.jpg"

    def test_long_filename_truncated(self):
        long_name = "a" * 300 + ".txt"
        result = sanitize_filename(long_name)
        assert len(result) <= 255

    def test_filename_without_extension_truncated(self):
        long_name = "b" * 300
        result = sanitize_filename(long_name)
        assert len(result) <= 255


# ---------------------------------------------------------------------------
# validate_date_range
# ---------------------------------------------------------------------------

class TestValidateDateRange:
    def test_valid_range(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 6, 1)
        assert validate_date_range(start, end) is True

    def test_end_before_start_is_invalid(self):
        start = datetime(2025, 6, 1)
        end = datetime(2025, 1, 1)
        assert validate_date_range(start, end) is False

    def test_same_date_is_invalid(self):
        dt = datetime(2025, 3, 15)
        assert validate_date_range(dt, dt) is False

    def test_none_start_is_valid(self):
        assert validate_date_range(None, datetime(2025, 6, 1)) is True

    def test_none_end_is_valid(self):
        assert validate_date_range(datetime(2025, 1, 1), None) is True

    def test_both_none_is_valid(self):
        assert validate_date_range(None, None) is True
