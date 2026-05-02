import uuid
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from langgraph.types import Command

from agents.graph import graph
from agents.publisher import _META_API
from db.bigquery import get_campaigns
from dependencies import get_current_user
from models.user import UserContext

logger = logging.getLogger(__name__)
router = APIRouter(tags=["campaign"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _config(thread_id: str, user_id: str) -> dict:
    return {"configurable": {"thread_id": f"{user_id}:{thread_id}"}}


def _run(input_or_command: Any, config: dict) -> dict:
    """
    Run graph until the next interrupt or END.
    Returns {status, data, next_node}.
    """
    try:
        graph.invoke(input_or_command, config=config)
    except Exception as exc:
        logger.error(f"Graph execution error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(exc)}")

    state = graph.get_state(config)
    logger.info(f"Graph state — next: {state.next}, tasks: {len(state.tasks)}")

    if state.next:
        interrupt_data = None
        for task in state.tasks:
            if task.interrupts:
                interrupt_data = task.interrupts[0].value
                break
        logger.info(f"Graph interrupted — type: {interrupt_data.get('type') if isinstance(interrupt_data, dict) else 'unknown'}")
        return {
            "status": "waiting",
            "data": interrupt_data,
            "next_node": list(state.next),
        }

    publish_result = state.values.get("publish_result", {})
    if not publish_result:
        logger.warning("Graph completed but publish_result is empty — pipeline may have run with no content")

    return {
        "status": "complete",
        "data": publish_result,
        "next_node": [],
    }


# ── Request models ─────────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    message: str

class ReplyRequest(BaseModel):
    thread_id: str
    reply: str

class RefineRequest(BaseModel):
    thread_id: str
    instruction: str

class PublishRequest(BaseModel):
    thread_id: str
    selected: dict  # {image_url, caption, email}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/campaign/start")
def start_campaign(
    body: StartRequest,
    current_user: UserContext = Depends(get_current_user),
):
    thread_id = str(uuid.uuid4())
    config = _config(thread_id, current_user.user_id)
    result = _run(
        {
            "user_context": current_user,
            "user_input": body.message,
            "iteration_count": 0,
        },
        config,
    )
    return {"thread_id": thread_id, **result}


@router.post("/campaign/reply")
def reply_to_campaign(
    body: ReplyRequest,
    current_user: UserContext = Depends(get_current_user),
):
    """Send a follow-up answer or a trend pick back to the graph."""
    config = _config(body.thread_id, current_user.user_id)
    if not graph.get_state(config).values:
        raise HTTPException(404, "Campaign thread not found")
    result = _run(Command(resume=body.reply), config)
    return {"thread_id": body.thread_id, **result}


@router.post("/campaign/refine")
def refine_campaign(
    body: RefineRequest,
    current_user: UserContext = Depends(get_current_user),
):
    """User clicked Refine — send instruction back to supervisor."""
    config = _config(body.thread_id, current_user.user_id)
    if not graph.get_state(config).values:
        raise HTTPException(404, "Campaign thread not found")
    result = _run(
        Command(resume={"action": "refine", "instruction": body.instruction}),
        config,
    )
    return {"thread_id": body.thread_id, **result}


@router.post("/campaign/publish")
def publish_campaign(
    body: PublishRequest,
    current_user: UserContext = Depends(get_current_user),
):
    """User clicked Publish — send final selections to publisher node."""
    config = _config(body.thread_id, current_user.user_id)
    if not graph.get_state(config).values:
        raise HTTPException(404, "Campaign thread not found")
    result = _run(
        Command(resume={"action": "publish", "selected": body.selected}),
        config,
    )
    return {"thread_id": body.thread_id, **result}


@router.get("/campaigns")
def list_campaigns(current_user: UserContext = Depends(get_current_user)):
    """Return the authenticated user's published campaign history."""
    return {"campaigns": get_campaigns(current_user.user_id)}


@router.get("/campaigns/ig-stats/{post_id}")
def get_ig_stats(
    post_id: str,
    current_user: UserContext = Depends(get_current_user),
):
    """Fetch like_count and comments_count for a published Instagram post."""
    if not current_user.instagram_access_token:
        return {"like_count": None, "comments_count": None}
    try:
        resp = httpx.get(
            f"{_META_API}/{post_id}",
            params={
                "fields": "like_count,comments_count",
                "access_token": current_user.instagram_access_token,
            },
            timeout=10,
        )
        data = resp.json()
        return {
            "like_count": data.get("like_count"),
            "comments_count": data.get("comments_count"),
        }
    except Exception as exc:
        logger.warning(f"IG stats fetch failed for {post_id}: {exc}")
        return {"like_count": None, "comments_count": None}


@router.get("/campaign/status/{thread_id}")
def campaign_status(
    thread_id: str,
    current_user: UserContext = Depends(get_current_user),
):
    config = _config(thread_id, current_user.user_id)
    state = graph.get_state(config)
    if not state.values:
        raise HTTPException(404, "Campaign thread not found")

    safe_state = {k: v for k, v in state.values.items() if k != "user_context"}
    return {
        "thread_id": thread_id,
        "state": safe_state,
        "next_node": list(state.next) if state.next else [],
        "is_complete": not bool(state.next),
    }
