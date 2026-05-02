import uuid
from google.cloud import storage
from config import settings

_client = storage.Client(project=settings.GCP_PROJECT_ID)
_bucket = _client.bucket(settings.GCS_BUCKET_NAME)


def _public_url(blob_name: str) -> str:
    return f"https://storage.googleapis.com/{settings.GCS_BUCKET_NAME}/{blob_name}"


def upload_logo(file_bytes: bytes, content_type: str, user_id: str) -> str:
    ext = "png" if "png" in content_type else "jpg"
    blob_name = f"logos/{user_id}/{uuid.uuid4()}.{ext}"
    blob = _bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type=content_type)
    return _public_url(blob_name)


def upload_email_list(file_bytes: bytes, user_id: str) -> str:
    blob_name = f"email-lists/{user_id}/contacts.csv"
    blob = _bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type="text/csv")
    return _public_url(blob_name)


def upload_photo(file_bytes: bytes, content_type: str, user_id: str) -> str:
    ext = "png" if "png" in content_type else "jpg"
    blob_name = f"product-photos/{user_id}/{uuid.uuid4()}.{ext}"
    blob = _bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type=content_type)
    return _public_url(blob_name)


def upload_generated_image(image_bytes: bytes, user_id: str) -> str:
    blob_name = f"generated/{user_id}/{uuid.uuid4()}.png"
    blob = _bucket.blob(blob_name)
    blob.upload_from_string(image_bytes, content_type="image/png")
    return _public_url(blob_name)


def delete_file(gcs_url: str) -> None:
    """Delete a GCS object given its public HTTPS URL. Silently ignores missing blobs."""
    prefix = f"https://storage.googleapis.com/{settings.GCS_BUCKET_NAME}/"
    if not gcs_url.startswith(prefix):
        return
    blob_name = gcs_url[len(prefix):]
    blob = _bucket.blob(blob_name)
    blob.delete(if_generation_match=None)  # no-op if already gone
