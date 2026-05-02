import json
import logging
import re
from datetime import datetime

from google import genai
from google.genai import types
from langgraph.types import interrupt

from config import settings
from agents.state import GraphState

logger = logging.getLogger(__name__)

_client = genai.Client(vertexai=True, project=settings.GCP_PROJECT_ID, location="us-central1")
_MODEL = "gemini-2.5-pro"
_SEARCH_TOOL = types.Tool(google_search=types.GoogleSearch())

_PROMPT = """You are a social media trend analyst helping a small business create relevant Instagram content.

TODAY: {date}
BUSINESS: {business_name} ({industry})
LOCATION: {location}
DESCRIPTION: {description}
TARGET AUDIENCE: {target_audience}

Use Google Search to find {count} currently trending topics for Instagram content right now.

Return a DIVERSE mix — do NOT restrict to only {industry} or only {location}. Include all 4 of these categories:
1. Local/regional trends — what is trending in {location} or nearby right now (news, events, cultural moments)
2. Industry-specific trend — a topic directly relevant to {industry} and {target_audience}
3. Global viral trends — what is trending worldwide on Instagram/social media TODAY (viral challenges, memes, pop culture, international events) regardless of industry
4. Cross-industry opportunity — a broadly trending topic (tech, lifestyle, wellness, sports, entertainment) that a {industry} business can creatively spin for their audience

Use real-time Google Search to find what is ACTUALLY trending today. Avoid generic evergreen topics.

Return EXACTLY {count} trends as a raw JSON array (no markdown, no explanation):
[
  {{
    "title": "short catchy name (3-5 words)",
    "description": "why it is trending right now and a specific creative angle this business can use (2-3 sentences)",
    "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"],
    "relevance": "High" | "Medium" | "Low"
  }}
]"""


def _extract_json(text: str) -> list[dict]:
    try:
        result = json.loads(text.strip())
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    fenced = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if fenced:
        try:
            result = json.loads(fenced.group(1).strip())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    array_match = re.search(r'\[[\s\S]*\]', text)
    if array_match:
        try:
            result = json.loads(array_match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON array from response:\n{text[:400]}")


def _fetch(state: GraphState, count: int = 6) -> list[dict]:
    ctx = state["user_context"]
    logger.info(f"[TREND FETCH ▶] Calling Gemini ({_MODEL}) with Google Search Grounding")
    logger.info(f"[TREND FETCH ▶] Business: {ctx.business_name!r}, Industry: {ctx.industry!r}, "
                f"Location: {ctx.location or 'India'!r}")
    prompt = _PROMPT.format(
        date=datetime.now().strftime("%B %d, %Y"),
        business_name=ctx.business_name or "the business",
        industry=ctx.industry or "general",
        location=ctx.location or "India",
        description=ctx.description or "",
        target_audience=ctx.target_audience or "general audience",
        count=count,
    )

    response = _client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[_SEARCH_TOOL],
            temperature=0.7,
        ),
    )
    logger.info("[TREND FETCH ▶] Gemini responded — parsing JSON")

    trends = _extract_json(response.text)

    for t in trends:
        t.setdefault("relevance", "Medium")
        if not isinstance(t.get("hashtags"), list):
            t["hashtags"] = []

    logger.info(f"[TREND FETCH ▶] Fetched {len(trends)} trends: "
                + ", ".join(f"{t['title']!r}({t.get('relevance','?')})" for t in trends[:7]))
    return trends[:7]


# ── Node 1: fetch and store trends ────────────────────────────────────────────

def trend_fetch_node(state: GraphState) -> dict:
    """
    Fetches trends from Gemini + Search Grounding and saves to state.
    Idempotent: skips the API call if trends are already in state (graph replay),
    unless the user explicitly requested more trends (fetch_more_trends=True).
    """
    logger.info("=" * 60)
    logger.info("[TREND FETCH ▶] Node started")

    existing = state.get("trend_options", [])
    want_more = state.get("fetch_more_trends", False)

    if existing and not want_more:
        logger.info(f"[TREND FETCH ▶] Trends already in state ({len(existing)} items) — skipping fetch (graph replay)")
        return {}

    try:
        new_trends = _fetch(state)
    except Exception as e:
        logger.error(f"[TREND FETCH ▶] Fetch failed: {e} — returning fallback card")
        new_trends = [{
            "title": "Could not fetch trends",
            "description": "Search Grounding unavailable. Try describing a specific occasion instead.",
            "hashtags": [],
            "relevance": "Low",
        }]

    if want_more and existing:
        # Accumulate: add new trends, deduplicate by title so user sees all options
        existing_titles = {t["title"].lower() for t in existing}
        unique_new = [t for t in new_trends if t["title"].lower() not in existing_titles]
        all_trends = existing + unique_new
        logger.info(f"[TREND FETCH ▶] Appended {len(unique_new)} new to {len(existing)} existing = {len(all_trends)} total")
    else:
        all_trends = new_trends

    logger.info("[TREND FETCH ▶] Node complete — trends saved to state")
    return {"trend_options": all_trends, "fetch_more_trends": False}


# ── Node 2: show trends to user, wait for pick ───────────────────────────────

def trend_select_node(state: GraphState) -> dict:
    """
    Reads trends from state (set by trend_fetch_node) and interrupts for user to pick.
    Single interrupt — no loop, no extra fetch on resume.
    """
    logger.info("=" * 60)
    logger.info("[TREND SELECT ▶] Node started")

    trends = state.get("trend_options", [])
    logger.info(f"[TREND SELECT ▶] Presenting {len(trends)} trends to user — pausing for selection")

    user_input = interrupt({
        "type": "trend_selection",
        "trend_options": trends,
    })

    # User asked for a fresh batch — signal graph to loop back through fetch
    if isinstance(user_input, str) and "fetch more" in user_input.lower():
        logger.info("[TREND SELECT ▶] User requested more trends — routing back to fetch")
        return {"fetch_more_trends": True}

    # Frontend sends JSON.stringify(trend) — parse it before substring matching,
    # otherwise titles with quotes get mismatched against the JSON-escaped string
    if isinstance(user_input, str) and user_input.strip().startswith("{"):
        try:
            parsed = json.loads(user_input)
            if isinstance(parsed, dict) and "title" in parsed:
                user_input = parsed
        except (ValueError, TypeError):
            pass

    if isinstance(user_input, dict) and "title" in user_input:
        selected = user_input
    elif isinstance(user_input, str):
        match = next((t for t in trends if t["title"].lower() in user_input.lower()), None)
        selected = match or (trends[0] if trends else {})
    else:
        selected = trends[0] if trends else {}

    logger.info(f"[TREND SELECT ▶] User selected: {selected.get('title')!r}")
    logger.info("[TREND SELECT ▶] Node complete")
    return {"selected_trend": selected, "fetch_more_trends": False}
