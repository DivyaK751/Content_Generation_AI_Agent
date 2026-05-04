import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from cache import invalidate_user
from db.bigquery import update_user
from db.usage import (
    PLAN_LIMITS,
    get_usage,
    invalidate_usage_cache,
    rollover_usage,
    reset_usage,
)
from dependencies import get_current_user
from models.user import UserContext

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscription", tags=["subscription"])

_VALID_PLANS = ("free", "starter", "growth", "pro")


class UpgradeRequest(BaseModel):
    plan: str


@router.get("/status")
def get_subscription_status(current_user: UserContext = Depends(get_current_user)):
    usage = get_usage(current_user.user_id)
    limit = PLAN_LIMITS.get(current_user.plan, 30)
    return {
        "plan": current_user.plan,
        "plan_status": current_user.plan_status,
        "images_used": usage.get("images_used", 0),
        "images_limit": limit,
        "billing_cycle_start": current_user.billing_cycle_start,
        "can_post_instagram": current_user.can_post_instagram,
        "can_schedule": current_user.can_schedule,
    }


@router.post("/upgrade")
def upgrade_plan(
    body: UpgradeRequest,
    current_user: UserContext = Depends(get_current_user),
):
    if body.plan not in _VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {body.plan}")
    if body.plan == "free":
        raise HTTPException(status_code=400, detail="Use /subscription/downgrade to revert to free")

    now = datetime.now(timezone.utc)
    update_user(current_user.user_id, {
        "plan": body.plan,
        "plan_status": "active",
        "billing_cycle_start": now.isoformat(),
    })
    rollover_usage(current_user.user_id, now)
    invalidate_user(current_user.user_id)

    logger.info(f"[SUBSCRIPTION] User {current_user.user_id} upgraded to {body.plan}")
    return {
        "plan": body.plan,
        "plan_status": "active",
        "images_limit": PLAN_LIMITS[body.plan],
        "images_used": 0,
        "message": "Plan upgraded successfully (demo mode — no payment required)",
    }


@router.post("/downgrade")
def downgrade_to_free(current_user: UserContext = Depends(get_current_user)):
    update_user(current_user.user_id, {
        "plan": "free",
        "plan_status": "active",
        "billing_cycle_start": None,
    })
    invalidate_user(current_user.user_id)
    invalidate_usage_cache(current_user.user_id)

    logger.info(f"[SUBSCRIPTION] User {current_user.user_id} downgraded to free")
    return {"plan": "free", "message": "Downgraded to Free plan"}


@router.post("/reset-usage")
def reset_monthly_usage(current_user: UserContext = Depends(get_current_user)):
    reset_usage(current_user.user_id)
    logger.info(f"[SUBSCRIPTION] Usage reset for user {current_user.user_id}")
    return {"message": "Usage counter reset to 0"}
