from pydantic import BaseModel
from typing import Optional


class UserContext(BaseModel):
    user_id: str
    email: str
    # Business basics
    business_name: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    # Brand identity
    brand_colors: Optional[str] = None
    logo_gcs_url: Optional[str] = None
    image_url: Optional[str] = None
    tagline: Optional[str] = None
    tone: Optional[str] = None
    brand_font: Optional[str] = None
    tagline_font: Optional[str] = None
    body_font: Optional[str] = None
    # Target audience
    target_audience: Optional[str] = None
    age_group: Optional[str] = None
    gender: Optional[str] = None
    interests: Optional[str] = None
    # Content preferences
    content_types: Optional[str] = None
    image_style: Optional[str] = None
    language: Optional[str] = None
    guidelines: Optional[str] = None
    # Instagram
    instagram_handle: Optional[str] = None
    instagram_page_id: Optional[str] = None
    instagram_access_token: Optional[str] = None
    # Email
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    sendgrid_api_key: Optional[str] = None


class OnboardingForm(BaseModel):
    # Section 1 — Business basics
    business_name: str
    industry: str
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    # Section 2 — Brand identity (logo uploaded separately via /logo-upload)
    brand_colors: Optional[str] = None
    tagline: Optional[str] = None
    tone: Optional[str] = None
    brand_font: Optional[str] = None
    tagline_font: Optional[str] = None
    body_font: Optional[str] = None
    # Section 3 — Target audience
    target_audience: Optional[str] = None
    age_group: Optional[str] = None
    gender: Optional[str] = None
    interests: Optional[str] = None
    # Section 4 — Content preferences
    content_types: Optional[str] = None
    image_style: Optional[str] = None
    language: Optional[str] = None
    guidelines: Optional[str] = None
    # Section 5 — Instagram setup
    instagram_handle: Optional[str] = None
    instagram_page_id: Optional[str] = None
    instagram_access_token: Optional[str] = None
    # Section 6 — Email setup
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    sendgrid_api_key: Optional[str] = None
