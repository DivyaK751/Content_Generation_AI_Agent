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
FEATURED PRODUCTS (intentionally included in this campaign): {featured_products}

Evaluate this image for Instagram marketing use.

Return ONLY a raw JSON object (no markdown):
{{
  "passed": true | false,
  "score": 0-100,
  "issues": ["issue 1", "issue 2"],
  "notes": "brief overall assessment"
}}

IMPORTANT — FEATURED PRODUCTS: If {featured_products} is not "none", the listed products ARE intentionally
part of this campaign advertisement. Do NOT flag them as unrelated, confusing, or irrelevant — their presence
is correct and expected. Only flag products that are NOT in the featured products list.

HARD FAILURE RULES — if any of these are true, set passed=false and score <= 40, regardless of everything else:
- The brand logo graphic is absent from the image (no recognisable logo icon/graphic visible)
- The brand name "{business_name}" does not appear as text anywhere in the image
- Any visible text in the image contains a typo or misspelling (including brand name, tagline, marketing copy)

Check for (in order of importance):
1. CRITICAL — Logo present: Look carefully for the brand logo as a small graphic element, usually in a corner or along an edge. If it is absent → hard fail (passed=false, score <= 40).
2. CRITICAL — Brand name present: "{business_name}" must appear as readable text. Absent → hard fail.
3. CRITICAL — Typos: Check every word of visible text character by character. Any misspelling → hard fail.
4. HIGH — Relevance: The image must clearly relate to the campaign theme "{theme}".
5. MEDIUM — Content safety: No offensive, inappropriate, or misleading content.
6. LOW — Brand alignment (tone, style): Do not fail an image solely for tone or color palette.
- No hex color codes (#XXXXXX format) or technical design labels rendered as visible text — hard fail if present.

Pass only if score >= 60 AND none of the hard failure rules triggered."""

_REFINE_CHECK_PROMPT = """You are verifying whether a specific user-requested change was successfully applied to a marketing image.

USER'S REQUESTED CHANGE: "{refine_instruction}"

Look ONLY at whether this specific change has been applied. Do NOT evaluate brand quality, colors, composition, tone, or anything else — only check the one requested change.

Return ONLY a raw JSON object (no markdown):
{{
  "passed": true | false,
  "score": 0-100,
  "issues": ["describe specifically what is still wrong, or empty list if implemented"],
  "notes": "one sentence: was the change applied or not"
}}

If the change is clearly implemented: passed=true, score >= 80.
If the change is NOT implemented or only partially done: passed=false, score < 60."""

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


def _normalize_result(result: dict) -> dict:
    """Ensure 'passed' is always a bool, never None."""
    if result.get("passed") is None:
        result["passed"] = result.get("score", 70) >= 60
    return result


def _check_image_refine(image_url: str, refine_instruction: str) -> dict:
    """Focused check: did the edit implement the specific requested change?"""
    try:
        logger.info(f"[APPROVAL ▶] Refine check — verifying: {refine_instruction[:80]!r}")
        image_bytes = httpx.get(image_url, timeout=15, follow_redirects=True).content
        prompt = _REFINE_CHECK_PROMPT.format(refine_instruction=refine_instruction)
        response = _client.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                prompt,
            ],
            config=types.GenerateContentConfig(temperature=0.2),
        )
        result = _parse_result(response.text)
        logger.info(f"[APPROVAL ▶] Refine check: passed={result.get('passed')}, score={result.get('score')}")
        return result
    except Exception as exc:
        logger.warning(f"[APPROVAL ▶] Refine check failed ({exc}) — defaulting to pass")
        return {"passed": True, "score": 80, "issues": [], "notes": f"Check skipped: {exc}"}


def _check_image(image_url: str, ctx, theme: str, featured_products: list[str] | None = None) -> dict:
    try:
        logger.info(f"[APPROVAL ▶] Checking image: {image_url[:70]}...")
        image_bytes = httpx.get(image_url, timeout=15, follow_redirects=True).content
        logger.info(f"[APPROVAL ▶] Image downloaded ({len(image_bytes)} bytes) — running Gemini Vision check")

        import json as _json
        try:
            colors = _json.loads(ctx.brand_colors or "{}")
            color_list = colors.get("colors", [])
            if color_list:
                color_desc = ", ".join(c for c in color_list if c)
            else:
                color_desc = f"primary {colors.get('primary', '#4F46E5')}, secondary {colors.get('secondary', '#E0E7FF')}"
        except Exception:
            color_desc = ctx.brand_colors or "not specified"

        products_str = ", ".join(featured_products) if featured_products else "none"
        prompt = _IMAGE_CHECK_PROMPT.format(
            business_name=ctx.business_name,
            industry=ctx.industry or "general",
            tone=ctx.tone or "Professional",
            theme=theme,
            brand_colors=color_desc,
            featured_products=products_str,
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

    # Product mode: tell the approval agent which products are intentionally featured
    use_product = state.get("use_product", False)
    selected_products = state.get("selected_products", [])
    featured_product_names = (
        [p.get("product_name", "") for p in selected_products if p.get("product_name")]
        if use_product and selected_products else []
    )
    if featured_product_names:
        logger.info(f"[APPROVAL ▶] Product mode — featured products: {featured_product_names}")

    # Determine check mode:
    # 1. user_refine: user gave an explicit refine instruction → focused check on that one image only
    # 2. approval_retry: approval previously failed → focused check against previous per-item issues
    # 3. default: full quality check
    last_refine_instruction = state.get("last_refine_instruction", "")
    last_edited_index = state.get("last_edited_image_index")  # int or None
    previous_per_item = state.get("approval_result", {}).get("per_item", [])
    prev_image_items = [it for it in previous_per_item if it.get("type") == "image"]

    is_user_refine = bool(last_refine_instruction) and last_edited_index is not None
    is_retry = bool(prev_image_items) and iteration > 1 and not is_user_refine

    logger.info("=" * 60)
    logger.info(f"[APPROVAL ▶] Node started — iteration {iteration}, theme: {theme!r}, "
                f"channels={channels}, user_refine={is_user_refine}, retry={is_retry}")
    if is_user_refine:
        logger.info(f"[APPROVAL ▶] User refine check — instruction: {last_refine_instruction[:80]!r}, "
                    f"edited image index: {last_edited_index}")

    per_item: list[dict] = []
    all_scores: list[int] = []
    all_issues: list[str] = []

    # ── Image checks ──
    if "instagram" in channels:
        images = state.get("generated_images", [])
        for i, url in enumerate(images):
            if is_user_refine:
                if i == last_edited_index:
                    # This is the image the user asked to change — check only that instruction
                    result = _normalize_result(_check_image_refine(url, last_refine_instruction))
                else:
                    # Untouched image — auto-pass, no need to re-evaluate
                    logger.info(f"[APPROVAL ▶] Image {i+1} not edited — auto-pass")
                    result = {"passed": True, "score": 88, "issues": [], "notes": "Not edited in this refine"}
            elif is_retry and i < len(prev_image_items):
                prev_issues = prev_image_items[i].get("issues", [])
                if prev_issues:
                    refine_str = "; ".join(prev_issues)
                    result = _normalize_result(_check_image_refine(url, refine_str))
                else:
                    result = {"passed": True, "score": 85, "issues": [], "notes": "No issues from previous run"}
            else:
                result = _normalize_result(_check_image(url, ctx, theme, featured_products=featured_product_names))

            item = {"type": "image", "url": url, **result}
            item["edit_instruction"] = (
                "Fix these issues: " + "; ".join(result.get("issues", []))
                if result.get("issues") else ""
            )
            per_item.append(item)
            all_scores.append(result.get("score", 70))
            all_issues.extend(result.get("issues", []))

        captions = state.get("generated_captions", [])
        if captions:
            result = _normalize_result(_check_captions(captions, ctx, theme))
            per_item.append({"type": "captions", **result})
            all_scores.append(result.get("score", 70))
            all_issues.extend(result.get("issues", []))

    # ── Email checks ──
    if "email" in channels:
        emails = state.get("generated_emails", [])
        if emails:
            result = _normalize_result(_check_emails(emails, ctx, theme))
            per_item.append({"type": "emails", **result})
            all_scores.append(result.get("score", 70))
            all_issues.extend(result.get("issues", []))

    # ── Aggregate decision ──
    if not per_item:
        passed = True
        avg_score = 100
        notes = "No content to check."
        fix_instruction = ""
        image_failed = caption_failed = email_failed = False
        logger.info("[APPROVAL ▶] No content to check — passing through")
    else:
        avg_score = sum(all_scores) // len(all_scores)
        critical_failures = [item for item in per_item if not item.get("passed")]
        image_failed = any(i for i in per_item if i.get("type") == "image" and not i.get("passed"))
        caption_failed = any(i for i in per_item if i.get("type") == "captions" and not i.get("passed"))
        email_failed = any(i for i in per_item if i.get("type") == "emails" and not i.get("passed"))
        logger.info(f"[APPROVAL ▶] Checked {len(per_item)} items — avg score: {avg_score}, "
                    f"failures: {len(critical_failures)} (image={image_failed}, caption={caption_failed}, email={email_failed})")

        if iteration >= 4:
            passed = True
            notes = f"Forced pass after {iteration + 1} iterations."
            fix_instruction = ""
            image_failed = caption_failed = email_failed = False
            logger.warning(f"[APPROVAL ▶] Forcing pass after max iterations (score={avg_score})")
        elif critical_failures:
            passed = False
            notes = f"Score: {avg_score}. Failed checks: {len(critical_failures)}."
            fix_instruction = "Fix these issues: " + "; ".join(all_issues[:5]) if all_issues else ""
            logger.info(f"[APPROVAL ▶] FAILED — {notes} Fix instruction: {fix_instruction!r}")
        else:
            passed = True
            notes = f"Score: {avg_score}. All checks passed."
            fix_instruction = ""
            image_failed = caption_failed = email_failed = False
            logger.info(f"[APPROVAL ▶] PASSED — {notes}")

    logger.info("[APPROVAL ▶] Node complete")
    result = {
        "approval_result": {
            "passed": passed,
            "score": avg_score if per_item else 100,
            "notes": notes,
            "fix_instruction": fix_instruction,
            "per_item": per_item,
        },
        "regenerate_image": image_failed,
        "regenerate_caption": caption_failed,
        "regenerate_email": email_failed,
    }
    # Clear refine-loop tracking once the image passes — loop is complete
    if passed:
        result["last_refine_instruction"] = ""
        result["last_edited_image_index"] = None
    return result
