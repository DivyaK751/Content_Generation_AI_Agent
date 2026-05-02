import json
import logging
import re

import httpx
from google import genai
from google.genai import types

from config import settings
from agents.state import GraphState

logger = logging.getLogger(__name__)

_client = genai.Client(vertexai=True, project=settings.GCP_PROJECT_ID, location="us-central1")
_MODEL = "gemini-2.5-pro"

_IMAGE_CHECK_PROMPT = """You are a brand quality checker for Instagram marketing images.

BUSINESS: {business_name} ({industry})
BRAND TONE: {tone}
CAMPAIGN THEME: {theme}
BRAND COLORS: {brand_colors}

Evaluate this image for Instagram marketing use.

Return ONLY a raw JSON object (no markdown):
{{
  "passed": true | false,
  "score": 0-100,
  "issues": ["issue 1", "issue 2"],
  "notes": "brief overall assessment"
}}

Check for:
- Relevance to campaign theme and business
- Professional quality and visual appeal
- No offensive, inappropriate, or misleading content
- Brand alignment (tone, style)
- Instagram-suitable composition (square format, readable if text present)
- No hex color codes (#XXXXXX format), technical design labels, or color value strings rendered as visible text in the image — flag these as a critical issue

Be lenient — pass if score >= 60 and no critical issues."""

_CAPTION_CHECK_PROMPT = """You are a brand quality checker for Instagram captions.

BUSINESS: {business_name} ({industry})
BRAND TONE: {tone}
LANGUAGE: {language}
CAMPAIGN THEME: {theme}
TOPICS TO AVOID: {guidelines}

Evaluate these {count} captions.

Return ONLY a raw JSON object (no markdown):
{{
  "passed": true | false,
  "score": 0-100,
  "issues": ["issue 1", "issue 2"],
  "notes": "brief overall assessment"
}}

Check for:
- Grammar and spelling correctness
- Tone matches brand ({tone})
- Correct language ({language})
- Relevant hashtags (not generic spam)
- No avoided topics: {guidelines}
- Engaging and appropriate for target audience

Be lenient — pass if score >= 60 and no critical issues."""

_EMAIL_CHECK_PROMPT = """You are a brand quality checker for marketing emails.

BUSINESS: {business_name} ({industry})
BRAND TONE: {tone}
LANGUAGE: {language}
CAMPAIGN THEME: {theme}
TOPICS TO AVOID: {guidelines}

Evaluate these {count} email drafts.

Return ONLY a raw JSON object (no markdown):
{{
  "passed": true | false,
  "score": 0-100,
  "issues": ["issue 1", "issue 2"],
  "notes": "brief overall assessment"
}}

Check for:
- Subject line is compelling and not spam-like
- Email body has clear greeting, content, CTA, and sign-off
- Grammar and spelling correctness
- Tone matches brand ({tone})
- Correct language ({language})
- No avoided topics: {guidelines}

Be lenient — pass if score >= 60 and no critical issues."""


def _parse_result(text: str) -> dict:
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    fenced = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if fenced:
        try:
            return json.loads(fenced.group(1).strip())
        except json.JSONDecodeError:
            pass
    obj_match = re.search(r'\{[\s\S]*\}', text)
    if obj_match:
        try:
            return json.loads(obj_match.group())
        except json.JSONDecodeError:
            pass
    return {"passed": True, "score": 70, "issues": [], "notes": "Could not parse response — defaulting to pass"}


def _check_image(image_url: str, ctx, theme: str) -> dict:
    try:
        logger.info(f"[APPROVAL ▶] Checking image: {image_url[:70]}...")
        image_bytes = httpx.get(image_url, timeout=15, follow_redirects=True).content
        logger.info(f"[APPROVAL ▶] Image downloaded ({len(image_bytes)} bytes) — running Gemini Vision check")

        import json as _json
        try:
            colors = _json.loads(ctx.brand_colors or "{}")
            color_desc = f"primary {colors.get('primary', '#4F46E5')}, secondary {colors.get('secondary', '#E0E7FF')}"
        except Exception:
            color_desc = ctx.brand_colors or "not specified"

        prompt = _IMAGE_CHECK_PROMPT.format(
            business_name=ctx.business_name,
            industry=ctx.industry or "general",
            tone=ctx.tone or "Professional",
            theme=theme,
            brand_colors=color_desc,
        )

        response = _client.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                prompt,
            ],
            config=types.GenerateContentConfig(temperature=0.2),
        )
        result = _parse_result(response.text)
        logger.info(f"[APPROVAL ▶] Image result: passed={result.get('passed')}, score={result.get('score')}, "
                    f"issues={result.get('issues', [])}")
        return result
    except Exception as exc:
        logger.warning(f"[APPROVAL ▶] Image check failed ({exc}) — defaulting to pass")
        return {"passed": True, "score": 70, "issues": [], "notes": f"Check skipped: {exc}"}


def _check_captions(captions: list[str], ctx, theme: str) -> dict:
    try:
        logger.info(f"[APPROVAL ▶] Checking {len(captions)} captions — calling Gemini")
        caption_text = "\n\n".join(f"Caption {i+1}:\n{c}" for i, c in enumerate(captions))
        prompt = _CAPTION_CHECK_PROMPT.format(
            business_name=ctx.business_name,
            industry=ctx.industry or "general",
            tone=ctx.tone or "Professional",
            language=ctx.language or "English",
            theme=theme,
            guidelines=ctx.guidelines or "none",
            count=len(captions),
        )
        response = _client.models.generate_content(
            model=_MODEL,
            contents=f"{prompt}\n\nCaptions to evaluate:\n{caption_text}",
            config=types.GenerateContentConfig(temperature=0.2),
        )
        result = _parse_result(response.text)
        logger.info(f"[APPROVAL ▶] Captions result: passed={result.get('passed')}, score={result.get('score')}")
        return result
    except Exception as exc:
        logger.warning(f"[APPROVAL ▶] Caption check failed ({exc}) — defaulting to pass")
        return {"passed": True, "score": 70, "issues": [], "notes": f"Check skipped: {exc}"}


def _check_emails(emails: list[dict], ctx, theme: str) -> dict:
    try:
        logger.info(f"[APPROVAL ▶] Checking {len(emails)} emails — calling Gemini")
        email_text = "\n\n".join(
            f"Email {i+1}:\nSubject: {e.get('subject', '')}\nBody:\n{e.get('body', '')}"
            for i, e in enumerate(emails)
        )
        prompt = _EMAIL_CHECK_PROMPT.format(
            business_name=ctx.business_name,
            industry=ctx.industry or "general",
            tone=ctx.tone or "Professional",
            language=ctx.language or "English",
            theme=theme,
            guidelines=ctx.guidelines or "none",
            count=len(emails),
        )
        response = _client.models.generate_content(
            model=_MODEL,
            contents=f"{prompt}\n\nEmails to evaluate:\n{email_text}",
            config=types.GenerateContentConfig(temperature=0.2),
        )
        result = _parse_result(response.text)
        logger.info(f"[APPROVAL ▶] Emails result: passed={result.get('passed')}, score={result.get('score')}")
        return result
    except Exception as exc:
        logger.warning(f"[APPROVAL ▶] Email check failed ({exc}) — defaulting to pass")
        return {"passed": True, "score": 70, "issues": [], "notes": f"Check skipped: {exc}"}


def approval_node(state: GraphState) -> dict:
    ctx = state["user_context"]
    channels = state.get("channels", [])
    iteration = state.get("iteration_count", 0)

    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    theme = brief.get("title") or brief.get("event", "campaign")

    logger.info("=" * 60)
    logger.info(f"[APPROVAL ▶] Node started — iteration {iteration}, theme: {theme!r}, channels={channels}")

    per_item: list[dict] = []
    all_scores: list[int] = []
    all_issues: list[str] = []

    # ── Image checks ──
    if "instagram" in channels:
        images = state.get("generated_images", [])
        for url in images:
            result = _check_image(url, ctx, theme)
            per_item.append({"type": "image", "url": url, **result})
            all_scores.append(result.get("score", 70))
            all_issues.extend(result.get("issues", []))

        captions = state.get("generated_captions", [])
        if captions:
            result = _check_captions(captions, ctx, theme)
            per_item.append({"type": "captions", **result})
            all_scores.append(result.get("score", 70))
            all_issues.extend(result.get("issues", []))

    # ── Email checks ──
    if "email" in channels:
        emails = state.get("generated_emails", [])
        if emails:
            result = _check_emails(emails, ctx, theme)
            per_item.append({"type": "emails", **result})
            all_scores.append(result.get("score", 70))
            all_issues.extend(result.get("issues", []))

    # ── Aggregate decision ──
    if not per_item:
        passed = True
        avg_score = 100
        notes = "No content to check."
        logger.info("[APPROVAL ▶] No content to check — passing through")
    else:
        avg_score = sum(all_scores) // len(all_scores)
        critical_failures = [item for item in per_item if not item.get("passed")]
        logger.info(f"[APPROVAL ▶] Checked {len(per_item)} items — avg score: {avg_score}, "
                    f"failures: {len(critical_failures)}")

        if iteration >= 4:
            passed = True
            notes = f"Forced pass after {iteration + 1} iterations. Score: {avg_score}. Issues: {'; '.join(all_issues[:3]) or 'none'}"
            logger.warning(f"[APPROVAL ▶] Forcing pass after max iterations (score={avg_score})")
        elif critical_failures:
            passed = False
            notes = f"Score: {avg_score}. Failed checks: {len(critical_failures)}. Issues: {'; '.join(all_issues[:5])}"
            logger.info(f"[APPROVAL ▶] FAILED — {notes}")
        else:
            passed = True
            notes = f"Score: {avg_score}. All checks passed."
            logger.info(f"[APPROVAL ▶] PASSED — {notes}")

    logger.info("[APPROVAL ▶] Node complete")
    return {
        "approval_result": {
            "passed": passed,
            "score": avg_score if per_item else 100,
            "notes": notes,
            "per_item": per_item,
        }
    }
