import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from google.cloud import bigquery
from config import settings

logger = logging.getLogger(__name__)

client = bigquery.Client(project=settings.GCP_PROJECT_ID)
_USAGE_TABLE = f"`{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_USERS}.user_usage`"

PLAN_LIMITS: dict[str, int] = {
    "free": 30,
    "starter": 150,
    "growth": 400,
    "pro": 1000,
}

# In-process cache: user_id -> {"images_used": int, "period_start": str}
_usage_cache: dict[str, dict] = {}


def get_usage(user_id: str) -> dict:
    if user_id in _usage_cache:
        return _usage_cache[user_id]

    query = f"""
        SELECT images_used, period_start
        FROM {_USAGE_TABLE}
        WHERE user_id = @user_id
        ORDER BY period_start DESC
        LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
    )
    rows = list(client.query(query, job_config=job_config).result())
    if rows:
        data = {"images_used": rows[0]["images_used"], "period_start": str(rows[0]["period_start"])}
    else:
        data = {"images_used": 0, "period_start": ""}
    _usage_cache[user_id] = data
    return data


def check_quota(user_id: str, plan: str) -> tuple[bool, int, int]:
    limit = PLAN_LIMITS.get(plan, 30)
    usage = get_usage(user_id)
    used = usage.get("images_used", 0)
    return used < limit, used, limit


def increment_usage(user_id: str, count: int) -> None:
    # Update in-process cache immediately
    cached = _usage_cache.get(user_id, {"images_used": 0, "period_start": ""})
    cached["images_used"] = cached.get("images_used", 0) + count
    _usage_cache[user_id] = cached

    # Persist to BigQuery (best-effort, non-blocking — called via BackgroundTasks)
    try:
        query = f"""
            UPDATE {_USAGE_TABLE}
            SET images_used = images_used + @count, last_updated = CURRENT_TIMESTAMP()
            WHERE user_id = @user_id
              AND period_start = (
                SELECT MAX(period_start) FROM {_USAGE_TABLE} WHERE user_id = @user_id
              )
        """
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
            bigquery.ScalarQueryParameter("count", "INT64", count),
        ])
        client.query(query, job_config=job_config).result()
        logger.info(f"[USAGE] Incremented {count} image(s) for user {user_id}")
    except Exception as exc:
        logger.error(f"[USAGE] Failed to persist increment for {user_id}: {exc}")


def rollover_usage(user_id: str, new_period_start: Optional[datetime] = None) -> None:
    if new_period_start is None:
        new_period_start = datetime.now(timezone.utc)
    usage_id = str(uuid.uuid4())
    period_str = new_period_start.isoformat()

    try:
        query = f"""
            INSERT INTO {_USAGE_TABLE} (usage_id, user_id, period_start, images_used, last_updated)
            VALUES (@usage_id, @user_id, @period_start, 0, CURRENT_TIMESTAMP())
        """
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
            bigquery.ScalarQueryParameter("period_start", "TIMESTAMP", period_str),
        ])
        client.query(query, job_config=job_config).result()
        _usage_cache[user_id] = {"images_used": 0, "period_start": period_str}
        logger.info(f"[USAGE] Rolled over usage for user {user_id}, new period: {period_str}")
    except Exception as exc:
        logger.error(f"[USAGE] Rollover failed for {user_id}: {exc}")


def init_free_usage(user_id: str) -> None:
    usage_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    try:
        query = f"""
            INSERT INTO {_USAGE_TABLE} (usage_id, user_id, period_start, images_used, last_updated)
            VALUES (@usage_id, @user_id, CURRENT_TIMESTAMP(), 0, CURRENT_TIMESTAMP())
        """
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
            bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
        ])
        client.query(query, job_config=job_config).result()
        _usage_cache[user_id] = {"images_used": 0, "period_start": now}
        logger.info(f"[USAGE] Initialized free usage for user {user_id}")
    except Exception as exc:
        logger.error(f"[USAGE] Init failed for {user_id}: {exc}")


def invalidate_usage_cache(user_id: str) -> None:
    _usage_cache.pop(user_id, None)


def reset_usage(user_id: str) -> None:
    """Dev/admin: reset images_used to 0 for the current period."""
    try:
        query = f"""
            UPDATE {_USAGE_TABLE}
            SET images_used = 0, last_updated = CURRENT_TIMESTAMP()
            WHERE user_id = @user_id
              AND period_start = (
                SELECT MAX(period_start) FROM {_USAGE_TABLE} WHERE user_id = @user_id
              )
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("user_id", "STRING", user_id)]
        )
        client.query(query, job_config=job_config).result()
        _usage_cache.pop(user_id, None)
        logger.info(f"[USAGE] Reset usage for user {user_id}")
    except Exception as exc:
        logger.error(f"[USAGE] Reset failed for {user_id}: {exc}")
