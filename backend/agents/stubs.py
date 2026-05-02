import logging
from langgraph.types import interrupt
from agents.state import GraphState

logger = logging.getLogger(__name__)


def trend_analyzer_node(state: GraphState) -> dict:
    logger.info("[STUB] trend_analyzer_node")
    stub_trends = [
        {"title": "Summer Wellness", "description": "Health and self-care routines for summer", "hashtags": ["#WellnessWednesday", "#SummerHealth"], "relevance": "High"},
        {"title": "Local Business Spotlight", "description": "Communities celebrating neighbourhood brands", "hashtags": ["#ShopLocal", "#LocalLove"], "relevance": "High"},
        {"title": "Behind the Scenes", "description": "Audiences loving authentic brand stories", "hashtags": ["#BTS", "#BehindTheScenes"], "relevance": "Medium"},
        {"title": "Sustainable Living", "description": "Eco-friendly products and habits trending", "hashtags": ["#GoGreen", "#Sustainable"], "relevance": "Medium"},
        {"title": "Monday Motivation", "description": "Inspirational content peaks early week", "hashtags": ["#MondayMotivation", "#Inspire"], "relevance": "Medium"},
    ]

    while True:
        user_input = interrupt({
            "type": "trend_selection",
            "trend_options": stub_trends,
        })
        if isinstance(user_input, str) and "more" in user_input.lower():
            # Fetch more: return a refreshed stub list (real agent will call Gemini again)
            continue
        # User picked a trend (sent as dict or string title)
        if isinstance(user_input, dict):
            selected = user_input
        else:
            selected = stub_trends[0]
        return {"trend_options": stub_trends, "selected_trend": selected}


def content_generator_node(state: GraphState) -> dict:
    logger.info("[STUB] content_generator_node")
    channels = state.get("channels", [])
    updates: dict = {"iteration_count": state.get("iteration_count", 0) + 1}
    if "instagram" in channels:
        updates["generated_images"] = ["https://via.placeholder.com/1080x1080.png"]
        updates["generated_captions"] = ["Stub caption — great products await! #brand #trending"]
    if "email" in channels:
        updates["generated_emails"] = [{"subject": "Stub Subject Line", "body": "Stub email body content here."}]
    return updates


def approval_node(state: GraphState) -> dict:
    logger.info("[STUB] approval_node")
    return {
        "approval_result": {
            "passed": True,
            "notes": "Stub approval — all checks passed",
            "per_item": [],
        }
    }


def human_review_node(state: GraphState) -> dict:
    logger.info("[STUB] human_review_node — interrupting for user selection")
    selection = interrupt({
        "type": "human_review",
        "generated_images": state.get("generated_images", []),
        "generated_captions": state.get("generated_captions", []),
        "generated_emails": state.get("generated_emails", []),
        "approval_result": state.get("approval_result", {}),
    })

    if isinstance(selection, dict) and selection.get("action") == "refine":
        return {
            "refine_instruction": selection.get("instruction", ""),
            "selected": {},
        }

    return {
        "selected": selection.get("selected", {}) if isinstance(selection, dict) else {},
        "refine_instruction": "",
    }


def publisher_node(state: GraphState) -> dict:
    logger.info("[STUB] publisher_node")
    return {
        "publish_result": {
            "status": "published",
            "channels": state.get("channels", []),
            "instagram_post_id": "stub_ig_post_123",
            "email_message_id": "stub_email_msg_456",
        }
    }
