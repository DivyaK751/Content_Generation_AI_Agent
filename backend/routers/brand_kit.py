import logging
import uuid
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from typing import Optional

from db.bigquery import (
    get_user, update_user,
    get_user_photos, get_user_logos, delete_user_logo, delete_user_photo,
    get_user_products, insert_user_product, update_user_product, delete_user_product,
)
from db.storage import delete_file, upload_photo
from dependencies import get_current_user
from models.user import UserContext, Product
from cache import invalidate_user, set_cached_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["brand-kit"])


class BrandKitUpdate(BaseModel):
    business_name: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    brand_colors: Optional[str] = None
    tagline: Optional[str] = None
    tone: Optional[str] = None
    target_audience: Optional[str] = None
    age_group: Optional[str] = None
    gender: Optional[str] = None
    interests: Optional[str] = None
    content_types: Optional[str] = None
    image_style: Optional[str] = None
    language: Optional[str] = None
    guidelines: Optional[str] = None
    instagram_handle: Optional[str] = None
    instagram_page_id: Optional[str] = None
    instagram_access_token: Optional[str] = None
    brand_font: Optional[str] = None
    tagline_font: Optional[str] = None
    body_font: Optional[str] = None
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    sendgrid_api_key: Optional[str] = None


@router.get("/brand-kit", response_model=UserContext)
def get_brand_kit(current_user: UserContext = Depends(get_current_user)):
    # Always fetch fresh from BigQuery so manual edits or recently saved fields appear immediately
    row = get_user(current_user.user_id)
    if not row:
        return current_user
    valid = UserContext.model_fields.keys()
    fresh = UserContext(**{k: v for k, v in row.items() if k in valid})
    # Load products too — they're not in the users table
    product_rows = get_user_products(current_user.user_id)
    fresh = fresh.model_copy(update={"products": [Product(**p) for p in product_rows]})
    set_cached_user(fresh)
    return fresh


@router.get("/user-logos")
def list_user_logos(current_user: UserContext = Depends(get_current_user)):
    logos = get_user_logos(current_user.user_id)
    for lg in logos:
        url: str = lg.get("gcs_url", "")
        if url.startswith("gs://"):
            lg["gcs_url"] = url.replace("gs://", "https://storage.googleapis.com/", 1)
    return {"logos": logos}


@router.get("/user-photos")
def list_user_photos(current_user: UserContext = Depends(get_current_user)):
    photos = get_user_photos(current_user.user_id)
    # Convert any legacy gs:// URLs to HTTPS
    for p in photos:
        url: str = p.get("gcs_url", "")
        if url.startswith("gs://"):
            p["gcs_url"] = url.replace("gs://", "https://storage.googleapis.com/", 1)
    return {"photos": photos}


@router.delete("/logo/{logo_id}")
def delete_logo(
    logo_id: str,
    current_user: UserContext = Depends(get_current_user),
):
    gcs_url = delete_user_logo(logo_id, current_user.user_id)
    if gcs_url is None:
        raise HTTPException(404, "Logo not found")
    try:
        delete_file(gcs_url)
    except Exception as exc:
        logger.warning(f"GCS delete failed for {gcs_url}: {exc} — row already deleted from BigQuery")
    # Keep users.logo_gcs_url in sync — fall back to next most-recent logo or clear it
    remaining = get_user_logos(current_user.user_id)
    new_primary = remaining[0]["gcs_url"] if remaining else None
    update_user(current_user.user_id, {"logo_gcs_url": new_primary or ""})
    invalidate_user(current_user.user_id)
    return {"status": "ok"}


@router.delete("/photo/{photo_id}")
def delete_photo(
    photo_id: str,
    current_user: UserContext = Depends(get_current_user),
):
    gcs_url = delete_user_photo(photo_id, current_user.user_id)
    if gcs_url is None:
        raise HTTPException(404, "Photo not found")
    try:
        delete_file(gcs_url)
    except Exception as exc:
        logger.warning(f"GCS delete failed for {gcs_url}: {exc} — row already deleted from BigQuery")
    return {"status": "ok"}


@router.get("/user-products")
def list_user_products(current_user: UserContext = Depends(get_current_user)):
    rows = get_user_products(current_user.user_id)
    for p in rows:
        url: str = p.get("image_url", "")
        if url.startswith("gs://"):
            p["image_url"] = url.replace("gs://", "https://storage.googleapis.com/", 1)
        if p.get("created_at"):
            p["created_at"] = p["created_at"].isoformat()
    return {"products": rows}


@router.post("/user-products")
async def create_product(
    product_name: str = Form(...),
    product_theme: str = Form(...),
    file: UploadFile = File(...),
    current_user: UserContext = Depends(get_current_user),
):
    contents = await file.read()
    image_url = await run_in_threadpool(upload_photo, contents, file.content_type, current_user.user_id)
    product_id = str(uuid.uuid4())
    await run_in_threadpool(
        insert_user_product, product_id, current_user.user_id, product_name, image_url, product_theme
    )
    invalidate_user(current_user.user_id)
    return {"product_id": product_id, "image_url": image_url, "product_name": product_name, "product_theme": product_theme}


@router.patch("/user-products/{product_id}")
async def edit_product(
    product_id: str,
    product_name: str = Form(...),
    product_theme: str = Form(...),
    file: Optional[UploadFile] = File(None),
    current_user: UserContext = Depends(get_current_user),
):
    new_image_url: Optional[str] = None
    if file and file.filename:
        contents = await file.read()
        new_image_url = await run_in_threadpool(upload_photo, contents, file.content_type, current_user.user_id)
    await run_in_threadpool(
        update_user_product, product_id, current_user.user_id, product_name, product_theme, new_image_url
    )
    invalidate_user(current_user.user_id)
    return {"status": "ok"}


@router.delete("/user-products/{product_id}")
def remove_product(
    product_id: str,
    current_user: UserContext = Depends(get_current_user),
):
    image_url = delete_user_product(product_id, current_user.user_id)
    if image_url is None:
        raise HTTPException(404, "Product not found")
    try:
        delete_file(image_url)
    except Exception as exc:
        logger.warning(f"GCS delete failed for {image_url}: {exc} — row already deleted from BigQuery")
    invalidate_user(current_user.user_id)
    return {"status": "ok"}


@router.patch("/brand-kit")
def update_brand_kit(
    data: BrandKitUpdate,
    current_user: UserContext = Depends(get_current_user),
):
    updates = data.model_dump(exclude_none=True)
    if updates:
        update_user(current_user.user_id, updates)
        invalidate_user(current_user.user_id)
    return {"status": "ok"}
