from google.cloud import bigquery
from config import settings

client = bigquery.Client(project=settings.GCP_PROJECT_ID)
_TABLE = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.users`"


def get_user(user_id: str) -> dict | None:
    query = f"SELECT * FROM {_TABLE} WHERE user_id = @user_id LIMIT 1"
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    return dict(rows[0]) if rows else None


def get_user_by_email(email: str) -> dict | None:
    query = f"SELECT * FROM {_TABLE} WHERE email = @email LIMIT 1"
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("email", "STRING", email)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    return dict(rows[0]) if rows else None


def insert_user(user_id: str, email: str) -> None:
    query = f"""
        INSERT INTO {_TABLE} (user_id, email, created_at)
        VALUES (@user_id, @email, CURRENT_TIMESTAMP())
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
            bigquery.ScalarQueryParameter("email", "STRING", email),
        ]
    )
    client.query(query, job_config=job_config).result()
    # Wait for BQ DML to be visible to subsequent SELECT queries
    import time; time.sleep(2)


def insert_user_logo(logo_id: str, user_id: str, gcs_url: str, filename: str) -> None:
    query = f"""
        INSERT INTO `{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_logos`
        (logo_id, user_id, gcs_url, filename, created_at)
        VALUES (@logo_id, @user_id, @gcs_url, @filename, CURRENT_TIMESTAMP())
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("logo_id", "STRING", logo_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        bigquery.ScalarQueryParameter("gcs_url", "STRING", gcs_url),
        bigquery.ScalarQueryParameter("filename", "STRING", filename),
    ])
    client.query(query, job_config=job_config).result()


def delete_user_logo(logo_id: str, user_id: str) -> str | None:
    """Delete a logo row and return its gcs_url so the caller can remove the GCS file."""
    _LOGOS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_logos`"
    # Fetch URL first
    fetch = f"SELECT gcs_url FROM {_LOGOS} WHERE logo_id = @logo_id AND user_id = @user_id LIMIT 1"
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("logo_id", "STRING", logo_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
    ])
    rows = list(client.query(fetch, job_config=job_config).result())
    if not rows:
        return None
    gcs_url = rows[0]["gcs_url"]
    # Delete row
    delete = f"DELETE FROM {_LOGOS} WHERE logo_id = @logo_id AND user_id = @user_id"
    client.query(delete, job_config=bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("logo_id", "STRING", logo_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
    ])).result()
    return gcs_url


def delete_user_photo(photo_id: str, user_id: str) -> str | None:
    """Delete a photo row and return its gcs_url so the caller can remove the GCS file."""
    _PHOTOS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_photos`"
    fetch = f"SELECT gcs_url FROM {_PHOTOS} WHERE photo_id = @photo_id AND user_id = @user_id LIMIT 1"
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("photo_id", "STRING", photo_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
    ])
    rows = list(client.query(fetch, job_config=job_config).result())
    if not rows:
        return None
    gcs_url = rows[0]["gcs_url"]
    delete = f"DELETE FROM {_PHOTOS} WHERE photo_id = @photo_id AND user_id = @user_id"
    client.query(delete, job_config=bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("photo_id", "STRING", photo_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
    ])).result()
    return gcs_url


def get_user_logos(user_id: str) -> list[dict]:
    _LOGOS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_logos`"
    query = f"""
        SELECT logo_id, gcs_url, filename, created_at
        FROM {_LOGOS}
        WHERE user_id = @user_id
        ORDER BY created_at DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    return [dict(r) for r in rows]


def insert_user_photo(photo_id: str, user_id: str, gcs_url: str, filename: str) -> None:
    query = f"""
        INSERT INTO `{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_photos`
        (photo_id, user_id, gcs_url, filename, created_at)
        VALUES (@photo_id, @user_id, @gcs_url, @filename, CURRENT_TIMESTAMP())
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("photo_id", "STRING", photo_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        bigquery.ScalarQueryParameter("gcs_url", "STRING", gcs_url),
        bigquery.ScalarQueryParameter("filename", "STRING", filename),
    ])
    client.query(query, job_config=job_config).result()


def get_user_photos(user_id: str) -> list[dict]:
    _PHOTOS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_photos`"
    query = f"""
        SELECT photo_id, gcs_url, filename, created_at
        FROM {_PHOTOS}
        WHERE user_id = @user_id
        ORDER BY created_at DESC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    return [dict(r) for r in rows]


def insert_campaign(data: dict) -> None:
    """Insert a campaign record. Requires campaigns table — see DDL below.

    CREATE TABLE `agentic-ai-dk3480.social_content_agent.campaigns` (
      campaign_id STRING,
      user_id STRING,
      channels STRING,
      mode STRING,
      theme STRING,
      image_url STRING,
      all_image_urls STRING,   -- JSON array of all generated image URLs
      caption STRING,
      email_subject STRING,
      email_body STRING,
      instagram_post_id STRING,
      sendgrid_message_id STRING,
      status STRING,
      created_at TIMESTAMP
    );

    -- Run this once to add the column to an existing table:
    -- ALTER TABLE `agentic-ai-dk3480.social_content_agent.campaigns`
    --   ADD COLUMN all_image_urls STRING;
    """
    _CAMPAIGNS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.campaigns`"
    base_fields = [
        "campaign_id", "user_id", "channels", "mode", "theme",
        "image_url", "caption", "email_subject", "email_body",
        "instagram_post_id", "sendgrid_message_id", "status",
    ]
    # Include all_image_urls only when provided (requires ALTER TABLE if column is new)
    fields = base_fields + (["all_image_urls"] if "all_image_urls" in data else [])
    placeholders = ", ".join(f"@{f}" for f in fields)
    col_list = ", ".join(fields)
    query = f"INSERT INTO {_CAMPAIGNS} ({col_list}, created_at) VALUES ({placeholders}, CURRENT_TIMESTAMP())"
    params = [bigquery.ScalarQueryParameter(f, "STRING", str(data.get(f, ""))) for f in fields]
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()


def get_campaigns(user_id: str, limit: int = 50) -> list[dict]:
    """Fetch published campaigns for a user ordered newest-first."""
    _CAMPAIGNS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.campaigns`"
    query = f"""
        SELECT campaign_id, channels, mode, theme, image_url, all_image_urls,
               caption, email_subject, email_body, instagram_post_id,
               sendgrid_message_id, status, created_at
        FROM {_CAMPAIGNS}
        WHERE user_id = @user_id
        ORDER BY created_at DESC
        LIMIT @lim
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ])
    rows = list(client.query(query, job_config=job_config).result())
    result = []
    for r in rows:
        row = dict(r)
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
        result.append(row)
    return result


def insert_user_product(product_id: str, user_id: str, product_name: str, image_url: str, product_theme: str) -> None:
    _PRODUCTS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_products`"
    query = f"""
        INSERT INTO {_PRODUCTS}
        (product_id, user_id, product_name, image_url, product_theme, created_at)
        VALUES (@product_id, @user_id, @product_name, @image_url, @product_theme, CURRENT_TIMESTAMP())
    """
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("product_id", "STRING", product_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        bigquery.ScalarQueryParameter("product_name", "STRING", product_name),
        bigquery.ScalarQueryParameter("image_url", "STRING", image_url),
        bigquery.ScalarQueryParameter("product_theme", "STRING", product_theme),
    ])
    client.query(query, job_config=job_config).result()


def get_user_products(user_id: str) -> list[dict]:
    _PRODUCTS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_products`"
    query = f"""
        SELECT product_id, product_name, image_url, product_theme, created_at
        FROM {_PRODUCTS}
        WHERE user_id = @user_id
        ORDER BY created_at ASC
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    return [dict(r) for r in rows]


def update_user_product(product_id: str, user_id: str, product_name: str, product_theme: str, image_url: str | None = None) -> None:
    _PRODUCTS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_products`"
    sets = "product_name = @product_name, product_theme = @product_theme"
    params = [
        bigquery.ScalarQueryParameter("product_id", "STRING", product_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        bigquery.ScalarQueryParameter("product_name", "STRING", product_name),
        bigquery.ScalarQueryParameter("product_theme", "STRING", product_theme),
    ]
    if image_url is not None:
        sets += ", image_url = @image_url"
        params.append(bigquery.ScalarQueryParameter("image_url", "STRING", image_url))
    query = f"UPDATE {_PRODUCTS} SET {sets} WHERE product_id = @product_id AND user_id = @user_id"
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()


def delete_user_product(product_id: str, user_id: str) -> str | None:
    """Delete a product row and return its image_url so the caller can remove the GCS file."""
    _PRODUCTS = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_products`"
    fetch = f"SELECT image_url FROM {_PRODUCTS} WHERE product_id = @product_id AND user_id = @user_id LIMIT 1"
    job_config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("product_id", "STRING", product_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
    ])
    rows = list(client.query(fetch, job_config=job_config).result())
    if not rows:
        return None
    image_url = rows[0]["image_url"]
    delete = f"DELETE FROM {_PRODUCTS} WHERE product_id = @product_id AND user_id = @user_id"
    client.query(delete, job_config=bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("product_id", "STRING", product_id),
        bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
    ])).result()
    return image_url


def update_user(user_id: str, data: dict) -> None:
    if not data:
        return
    set_clauses = ", ".join(f"{k} = @{k}" for k in data)
    set_clauses += ", updated_at = CURRENT_TIMESTAMP()"
    params = [bigquery.ScalarQueryParameter("user_id", "STRING", user_id)] + [
        bigquery.ScalarQueryParameter(k, "STRING", str(v)) for k, v in data.items()
    ]
    query = f"UPDATE {_TABLE} SET {set_clauses} WHERE user_id = @user_id"
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()
