import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, Form, UploadFile, File
from starlette.concurrency import run_in_threadpool

from db.bigquery import update_user, insert_user_photo, insert_user_logo, insert_user_product
from db.storage import upload_logo, upload_email_list, upload_photo
from dependencies import get_current_user
from models.user import OnboardingForm, UserContext
from cache import invalidate_user, set_cached_user

router = APIRouter(tags=["onboarding"])


@router.post("/onboarding")
def save_onboarding(
    form: OnboardingForm,
    current_user: UserContext = Depends(get_current_user),
):
    data = form.model_dump(exclude_none=True)
    if data:
        update_user(current_user.user_id, data)
        invalidate_user(current_user.user_id)
    return {"status": "ok"}


@router.post("/logo-upload")
async def upload_logo_endpoint(
    file: UploadFile = File(...),
    current_user: UserContext = Depends(get_current_user),
):
    contents = await file.read()
    gcs_url = await run_in_threadpool(upload_logo, contents, file.content_type, current_user.user_id)
    logo_id = str(uuid.uuid4())
    await run_in_threadpool(insert_user_logo, logo_id, current_user.user_id, gcs_url, file.filename or "")
    await run_in_threadpool(update_user, current_user.user_id, {"logo_gcs_url": gcs_url})
    invalidate_user(current_user.user_id)
    return {"logo_id": logo_id, "gcs_url": gcs_url}


@router.post("/photos-upload")
async def upload_photo_endpoint(
    file: UploadFile = File(...),
    current_user: UserContext = Depends(get_current_user),
):
    contents = await file.read()
    gcs_url = await run_in_threadpool(upload_photo, contents, file.content_type, current_user.user_id)
    photo_id = str(uuid.uuid4())
    await run_in_threadpool(insert_user_photo, photo_id, current_user.user_id, gcs_url, file.filename or "")
    return {"photo_id": photo_id, "gcs_url": gcs_url}


@router.post("/product-upload")
async def upload_product_endpoint(
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
    return {"product_id": product_id, "image_url": image_url}


@router.post("/email-list-upload")
async def upload_email_list_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: UserContext = Depends(get_current_user),
):
    contents = await file.read()
    gcs_url = await run_in_threadpool(upload_email_list, contents, current_user.user_id)
    background_tasks.add_task(update_user, current_user.user_id, {"email_list_gcs_url": gcs_url})
    return {"email_list_gcs_url": gcs_url}
