import json
import logging

from google import genai
from google.genai import types
from langgraph.types import interrupt

from config import settings
from agents.state import GraphState

logger = logging.getLogger(__name__)

_client = genai.Client(vertexai=True, project=settings.GCP_PROJECT_ID, location="us-central1")
_MODEL = "gemini-2.0-flash-001"

_INTENT_PROMPT = """You are a supervisor for a social media content generation system for small businesses.

Analyze the user's message and extract their intent.

BUSINESS CONTEXT:
Business: {business_name} ({industry})
Description: {description}

USER MESSAGE: "{user_input}"

Determine:
1. mode:
   - "trend": user wants to find current trends to base content on
   - "occasion": user has a specific event, occasion, holiday, or theme in mind
   - "unknown": cannot determine

2. channels (what platforms they want content for):
   - Return a list containing "instagram", "email", or both
   - If the user clearly mentions instagram/social/post/reel → ["instagram"]
   - If the user clearly mentions email/newsletter/mailing list → ["email"]
   - If they mention both → ["instagram", "email"]
   - If unclear → ["unknown"]

3. If mode is "occasion": extract any event details mentioned (name, date, notes)

4. Set follow_up_needed=true if mode is "unknown".
   Write a friendly question asking what they want to create (trend-based or specific occasion).
   Do NOT ask about channels here — that is handled separately.

Return ONLY valid JSON, no markdown:
{{
  "mode": "trend" | "occasion" | "unknown",
  "channels": ["instagram"] | ["email"] | ["instagram", "email"] | ["unknown"],
  "occasion_brief": {{"event": "...", "date": "...", "notes": "..."}} | null,
  "follow_up_needed": true | false,
  "follow_up_question": "..." | null
}}"""

_OCCASION_GATHER_QUESTION = (
    "I'd love to help you create the perfect content for this occasion! "
    "A few quick details will make it much more tailored:\n\n"
    "• What's the specific event or theme? (e.g., Diwali sale, 2nd anniversary, monsoon launch)\n"
    "• When is it happening? (date or timeframe)\n"
    "• What's your key message or main offer? (e.g., 20% off, new collection, festive greetings)\n"
    "• Any specific products or services to feature?\n"
    "• Any visual direction or mood? (e.g., warm & festive, bold & energetic, minimal & clean)\n\n"
    "Share as much as you know — I'll handle the rest!"
)

_OCCASION_PARSE_PROMPT = """You are extracting event details from a user's message to build a content brief.

BUSINESS: {business_name} ({industry})
USER'S ANSWERS: "{user_answers}"

Extract the occasion details and return ONLY a single JSON object (not an array), no markdown:
{{
  "event": "event/occasion name",
  "date": "date or timeframe, or null",
  "message": "key marketing message or offer",
  "products": "products/services to feature, or null",
  "visual_notes": "visual direction or mood, or null",
  "notes": "a concise 2-3 sentence creative brief combining all the above for the content generator",
  "gathered": true
}}"""

_REFINE_PROMPT = """You are a supervisor for a social media content generation system.

The user wants to refine content that was just generated. Analyze their instruction and decide which parts need to be regenerated.

REFINEMENT INSTRUCTION: "{refine_instruction}"
CHANNELS IN USE: {channels}

Return ONLY valid JSON, no markdown:
{{
  "regenerate_image": true | false,
  "regenerate_caption": true | false,
  "regenerate_email": true | false
}}"""


def _extract_intent(user_context, user_input: str) -> dict:
    logger.info(f"[SUPERVISOR ▶] Calling Gemini ({_MODEL}) for intent extraction")
    prompt = _INTENT_PROMPT.format(
        business_name=user_context.business_name or "Unknown",
        industry=user_context.industry or "Unknown",
        description=user_context.description or "",
        user_input=user_input,
    )
    response = _client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", temperature=0.1
        ),
    )
    result = json.loads(response.text)
    logger.info(f"[SUPERVISOR ▶] Gemini response: mode={result.get('mode')!r}, "
                f"channels={result.get('channels')}, follow_up_needed={result.get('follow_up_needed')}")
    return result


def supervisor_node(state: GraphState) -> dict:
    logger.info("=" * 60)
    logger.info("[SUPERVISOR ▶] Node started")
    user_context = state["user_context"]
    refine_instruction = state.get("refine_instruction", "")

    # ── Refine path ───────────────────────────────────────────────────────────
    if refine_instruction:
        logger.info(f"[SUPERVISOR ▶] REFINE path — instruction: {refine_instruction!r}")
        prompt = _REFINE_PROMPT.format(
            refine_instruction=refine_instruction,
            channels=state.get("channels", []),
        )
        response = _client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json", temperature=0.1
            ),
        )
        result = json.loads(response.text)
        logger.info(f"[SUPERVISOR ▶] Refine flags: image={result.get('regenerate_image')}, "
                    f"caption={result.get('regenerate_caption')}, email={result.get('regenerate_email')}")
        return {
            "regenerate_image": result.get("regenerate_image", True),
            "regenerate_caption": result.get("regenerate_caption", True),
            "regenerate_email": result.get("regenerate_email", True),
            "refine_instruction": "",
        }

    # ── Idempotency: skip if mode already determined (graph replay on resume) ─
    existing_mode = state.get("mode")
    if existing_mode and existing_mode != "unknown":
        logger.info(f"[SUPERVISOR ▶] Already have mode={existing_mode!r} — skipping re-analysis (graph replay)")
        return {}

    # ── Intent extraction — single interrupt if mode is unclear ──────────────
    user_input = state["user_input"]
    logger.info(f"[SUPERVISOR ▶] User input: {user_input!r}")

    result = _extract_intent(user_context, user_input)

    if result.get("follow_up_needed"):
        question = result.get("follow_up_question",
                              "What would you like to create — content around a current trend, or for a specific event or occasion?")
        logger.info(f"[SUPERVISOR ▶] Follow-up needed — pausing. Question: {question!r}")
        user_reply = interrupt({"type": "follow_up", "question": question})
        logger.info(f"[SUPERVISOR ▶] Resumed with: {user_reply!r}")
        user_input = f"{user_input}\n\nUser clarification: {user_reply}"
        result = _extract_intent(user_context, user_input)

    mode = result.get("mode", "unknown")
    channels = result.get("channels") or ["unknown"]

    # Last-resort mode default only — channels unknown is fine, clarify_node handles it
    if not mode or mode == "unknown":
        logger.warning("[SUPERVISOR ▶] mode still unknown after follow-up — defaulting to trend")
        mode = "trend"

    logger.info(f"[SUPERVISOR ▶] Intent: mode={mode!r}, channels={channels}")
    logger.info("[SUPERVISOR ▶] Node complete")
    return {
        "user_input": user_input,
        "mode": mode,
        "channels": channels,
        "occasion_brief": result.get("occasion_brief") or {},
    }


# ── Occasion gather node ───────────────────────────────────────────────────────

def occasion_gather_node(state: GraphState) -> dict:
    """
    Asks the user structured questions about the occasion, then parses
    their response into a rich occasion_brief for the content generator.
    Single interrupt — idempotent on graph replay.
    """
    logger.info("=" * 60)
    logger.info("[OCCASION GATHER ▶] Node started")

    existing_brief = state.get("occasion_brief", {})
    if existing_brief.get("gathered"):
        logger.info("[OCCASION GATHER ▶] Brief already gathered — skipping (graph replay)")
        return {}

    user_answers = interrupt({
        "type": "follow_up",
        "question": _OCCASION_GATHER_QUESTION,
    })

    logger.info(f"[OCCASION GATHER ▶] User answered: {str(user_answers)[:120]!r}")

    user_context = state["user_context"]
    prompt = _OCCASION_PARSE_PROMPT.format(
        business_name=user_context.business_name or "the business",
        industry=user_context.industry or "general",
        user_answers=user_answers,
    )
    response = _client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", temperature=0.1
        ),
    )
    brief = json.loads(response.text)
    if isinstance(brief, list):
        brief = brief[0] if brief else {}
    brief["gathered"] = True
    logger.info(f"[OCCASION GATHER ▶] Parsed brief: event={brief.get('event')!r}, date={brief.get('date')!r}")
    logger.info("[OCCASION GATHER ▶] Node complete")
    return {"occasion_brief": brief}


# ── Channels clarify node (separate node = single interrupt, no LangGraph issues) ──

def channels_clarify_node(state: GraphState) -> dict:
    """
    Fires only when supervisor couldn't determine channels.
    Single interrupt — asks specifically about Instagram vs email vs both.
    """
    logger.info("=" * 60)
    logger.info("[CHANNELS ▶] Node started — channels unknown, asking user")

    reply = interrupt({
        "type": "follow_up",
        "question": "Where would you like to post this content — Instagram, email, or both?",
    })

    logger.info(f"[CHANNELS ▶] User replied: {reply!r}")
    reply_lower = (reply or "").lower() if isinstance(reply, str) else ""

    if "both" in reply_lower or ("instagram" in reply_lower and "email" in reply_lower):
        channels = ["instagram", "email"]
    elif "email" in reply_lower or "newsletter" in reply_lower or "mail" in reply_lower:
        channels = ["email"]
    else:
        channels = ["instagram"]

    logger.info(f"[CHANNELS ▶] Resolved channels: {channels}")
    return {"channels": channels}
