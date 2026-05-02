import json
import logging
import re

import httpx
from google import genai
from google.genai import types

from config import settings
from db.storage import upload_generated_image
from agents.state import GraphState

logger = logging.getLogger(__name__)

_client = genai.Client(vertexai=True, project=settings.GCP_PROJECT_ID, location="us-central1")
_IMAGEN_MODEL = "imagen-4.0-generate-001"
_GEMINI_FLASH_IMAGE = "gemini-2.0-flash-exp"
_GEMINI_PRO = "gemini-2.5-pro"


# ── Prompt builders ────────────────────────────────────────────────────────────

def _hex_to_color_name(hex_color: str) -> str:
    """Convert a hex code to a plain-language color description."""
    hex_color = hex_color.strip().lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join(c * 2 for c in hex_color)
    if len(hex_color) != 6:
        return "brand color"
    try:
        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0
    except ValueError:
        return "brand color"
    max_c, min_c = max(r, g, b), min(r, g, b)
    l = (max_c + min_c) / 2.0
    if max_c == min_c:
        if l < 0.15: return "black"
        if l < 0.35: return "dark grey"
        if l < 0.65: return "grey"
        if l < 0.85: return "light grey"
        return "white"
    delta = max_c - min_c
    h = (((g - b) / delta) % 6 if max_c == r
         else (b - r) / delta + 2 if max_c == g
         else (r - g) / delta + 4) * 60
    s = delta / (1.0 - abs(2 * l - 1.0))
    if h < 15 or h >= 345:  hue = "red"
    elif h < 45:            hue = "orange"
    elif h < 75:            hue = "yellow"
    elif h < 150:           hue = "green"
    elif h < 195:           hue = "teal"
    elif h < 255:           hue = "blue"
    elif h < 285:           hue = "indigo"
    elif h < 315:           hue = "purple"
    else:                   hue = "pink"
    if l < 0.25:    prefix = "deep "
    elif l < 0.4:   prefix = "dark "
    elif l > 0.75:  prefix = "light "
    elif l > 0.6:   prefix = "soft "
    else:           prefix = ""
    if s < 0.3:     prefix = "muted " + prefix
    return (prefix + hue).strip()


def _describe_colors(brand_colors_json: str | None) -> str:
    """Return natural-language color descriptions from brand_colors JSON."""
    try:
        colors = json.loads(brand_colors_json or "{}")
    except Exception:
        return ""
    parts = []
    if colors.get("primary"):
        parts.append(f"{_hex_to_color_name(colors['primary'])} as the primary color")
    if colors.get("secondary"):
        parts.append(f"{_hex_to_color_name(colors['secondary'])} as the accent color")
    if colors.get("background"):
        parts.append(f"{_hex_to_color_name(colors['background'])} as the background tone")
    return ", ".join(parts)


def _image_prompt(ctx, brief: dict, refine: str = "") -> str:
    theme = brief.get("title") or brief.get("event", "")
    detail = brief.get("description") or brief.get("notes", "")
    if brief.get("message"):
        detail = f"{detail} Key message: {brief['message']}." if detail else f"Key message: {brief['message']}."
    if brief.get("products"):
        detail = f"{detail} Feature: {brief['products']}." if detail else f"Feature: {brief['products']}."
    if brief.get("visual_notes"):
        detail = f"{detail} Visual direction: {brief['visual_notes']}." if detail else brief["visual_notes"]

    color_desc = _describe_colors(ctx.brand_colors)

    text_elements = [f"'{ctx.business_name}' placed in a corner or along the bottom edge"]
    if ctx.tagline:
        text_elements.append(f"the tagline '{ctx.tagline}' integrated as styled text")
    text_rule = "The only text visible in the image is: " + " and ".join(text_elements) + "."

    lines = [
        f"Generate a professional Instagram marketing image for {ctx.business_name}, a {ctx.industry} business.",
        f"Campaign theme: {theme}.",
        detail or "",
        f"Visual style: {ctx.image_style or 'Photorealistic'}.",
        f"Brand tone: {ctx.tone or 'Professional'}.",
        f"Color inspiration: {color_desc} — choose a palette that best suits this theme, drawing from these brand colors where they enhance the composition." if color_desc else "",
        f"Target audience: {ctx.target_audience}." if ctx.target_audience else "",
        "Square 1:1 format. High quality, compelling composition suitable for Instagram.",
        text_rule,
        f"Additional instruction: {refine}" if refine else "",
    ]
    return "\n".join(l for l in lines if l)



def _caption_prompt(ctx, brief: dict, refine: str = "") -> str:
    theme = brief.get("title") or brief.get("event", "")
    hashtag_hint = ", ".join(brief.get("hashtags", []))
    event_details = " | ".join(filter(None, [
        brief.get("date") and f"Date: {brief['date']}",
        brief.get("message") and f"Offer/Message: {brief['message']}",
        brief.get("products") and f"Products: {brief['products']}",
    ]))
    return f"""Generate 3 distinct Instagram captions for {ctx.business_name}, a {ctx.industry} business.

Campaign theme: {theme}
{"Event details: " + event_details if event_details else ""}
Tone: {ctx.tone or 'Professional'}
Language: {ctx.language or 'English'}
Target audience: {ctx.target_audience or 'general audience'}
{"Tagline: " + ctx.tagline if ctx.tagline else ""}
{"Include these hashtags: " + hashtag_hint if hashtag_hint else ""}
{"Topics to avoid: " + ctx.guidelines if ctx.guidelines else ""}
{"Refinement: " + refine if refine else ""}

Make each caption different in style: one punchy, one storytelling, one question-based.
End each with 8-12 relevant hashtags.

IMPORTANT: Write plain text only. Do NOT use asterisks (*), bold (**), italics, or any markdown formatting. No special characters for emphasis — just natural Instagram-style prose.

Return ONLY a raw JSON array of 3 strings, no markdown:
["caption 1\\n\\n#tag1 #tag2", "caption 2\\n\\n#tag1 #tag2", "caption 3\\n\\n#tag1 #tag2"]"""


def _email_prompt(ctx, brief: dict, refine: str = "") -> str:
    theme = brief.get("title") or brief.get("event", "")
    return f"""Generate 3 marketing emails for {ctx.business_name}, a {ctx.industry} business.

Campaign theme: {theme}
Sender: {ctx.sender_name or ctx.business_name}
Tone: {ctx.tone or 'Professional'}
Language: {ctx.language or 'English'}
Target audience: {ctx.target_audience or 'general audience'}
{"Tagline: " + ctx.tagline if ctx.tagline else ""}
{"Topics to avoid: " + ctx.guidelines if ctx.guidelines else ""}
{"Refinement: " + refine if refine else ""}

Each email: compelling subject line + full body (greeting, body paragraphs, a call-to-action written as natural prose, sign-off).

IMPORTANT formatting rules — violations will break the display:
- Write PLAIN TEXT only. No HTML, no anchor tags, no <a href> links.
- No markdown: no **bold**, no *italic*, no __underline__.
- No placeholder brackets: do NOT write [CTA BUTTON: ...], [LINK], [YOUR NAME], [Click here], or any [PLACEHOLDER] patterns.
- Write the call-to-action as a plain sentence, e.g. "Visit our website to shop the collection."
- Use natural line breaks (newlines) for structure — no bullet symbols unless genuinely listing items.

Return ONLY a raw JSON array of 3 objects, no markdown:
[{{"subject": "...", "body": "..."}}, {{"subject": "...", "body": "..."}}, {{"subject": "...", "body": "..."}}]"""


def _clean_email_text(text: str) -> str:
    """Strip HTML tags, markdown formatting, and placeholder patterns from email text."""
    # Remove HTML anchor tags, keep inner text
    text = re.sub(r'<a[^>]*>(.*?)</a>', r'\1', text, flags=re.IGNORECASE | re.DOTALL)
    # Remove remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Remove markdown links [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove [CTA BUTTON: ...] and all-caps placeholder brackets
    text = re.sub(r'\[[A-Z][A-Z\s:]+[^\]]*\]', '', text)
    # Remove any remaining [...] placeholders
    text = re.sub(r'\[[^\]]{1,60}\]', '', text)
    # Remove ** bold markers (must precede single *)
    text = text.replace('**', '')
    # Remove *italic* markers
    text = re.sub(r'\*([^*\n]+)\*', r'\1', text)
    # Collapse 3+ blank lines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ── Image generation ───────────────────────────────────────────────────────────

def _imagen(prompt: str, count: int = 3) -> list[bytes]:
    logger.info(f"[CONTENT GEN ▶] Imagen 4.0 — generating {count} images")
    response = _client.models.generate_images(
        model=_IMAGEN_MODEL,
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=count,
            aspect_ratio="1:1",
            output_mime_type="image/png",
        ),
    )
    return [img.image.image_bytes for img in response.generated_images]


_ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _gemini_flash_image(prompt: str, asset_url: str, count: int = 3) -> list[bytes]:
    try:
        logger.info(f"[CONTENT GEN ▶] Gemini Flash — downloading brand asset from {asset_url[:60]}...")
        resp = httpx.get(asset_url, timeout=10, follow_redirects=True)
        asset_bytes = resp.content
        mime_type = resp.headers.get("content-type", "image/png").split(";")[0].strip()
        if mime_type not in _ALLOWED_MIME_TYPES:
            mime_type = "image/png"
        logger.info(f"[CONTENT GEN ▶] Brand asset downloaded ({len(asset_bytes)} bytes, {mime_type}) — generating {count} variations")

        results: list[bytes] = []
        for i in range(count):
            logger.info(f"[CONTENT GEN ▶] Gemini Flash — variation {i + 1}/{count}")
            variation_prompt = (
                f"Generate a new marketing image. {prompt}\n"
                f"Variation {i + 1} of {count}: use a slightly different layout and composition. "
                "The image attached is the brand logo. "
                "Embed this logo as a small, clearly visible element in the bottom-right corner of the new image. "
                "The logo must be legible and proportionate — neither cropped nor dominating the composition."
            )
            response = _client.models.generate_content(
                model=_GEMINI_FLASH_IMAGE,
                contents=[
                    variation_prompt,
                    types.Part.from_bytes(data=asset_bytes, mime_type=mime_type),
                ],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    temperature=0.8,
                ),
            )
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if getattr(part, "inline_data", None):
                        results.append(part.inline_data.data)
                        break
        if results:
            logger.info(f"[CONTENT GEN ▶] Gemini Flash — {len(results)} images generated")
            return results
        raise ValueError("No image parts in Gemini Flash response")
    except Exception as exc:
        logger.warning(f"[CONTENT GEN ▶] Gemini Flash failed ({exc}) — falling back to Imagen 4.0")
        return _imagen(prompt, count)


# ── Sub-agents ────────────────────────────────────────────────────────────────

def _run_image_agent(state: GraphState) -> list[str]:
    ctx = state["user_context"]
    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    refine = state.get("refine_instruction", "")
    approval_notes = state.get("approval_result", {}).get("notes", "")
    theme = brief.get("title") or brief.get("event", "campaign")

    logger.info(f"[CONTENT GEN ▶] Image agent — theme: {theme!r}")
    if refine:
        logger.info(f"[CONTENT GEN ▶] Image agent — refine instruction: {refine!r}")
    if approval_notes and not refine:
        logger.info(f"[CONTENT GEN ▶] Image agent — using approval notes: {approval_notes!r}")

    prompt = _image_prompt(ctx, brief, refine or approval_notes)
    brand_asset_url = ctx.logo_gcs_url or ctx.image_url
    logger.info(f"[CONTENT GEN ▶] Image agent — logo_gcs_url={ctx.logo_gcs_url!r}, image_url={ctx.image_url!r}, using={'Gemini Flash' if brand_asset_url else 'Imagen 4.0'}")

    if brand_asset_url:
        image_bytes_list = _gemini_flash_image(prompt, brand_asset_url)
    else:
        image_bytes_list = _imagen(prompt)

    logger.info(f"[CONTENT GEN ▶] Image agent — uploading {len(image_bytes_list)} images to GCS")
    urls = [upload_generated_image(b, ctx.user_id) for b in image_bytes_list]
    logger.info(f"[CONTENT GEN ▶] Image agent — done. URLs: {urls}")
    return urls


def _run_caption_agent(state: GraphState) -> list[str]:
    ctx = state["user_context"]
    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    refine = state.get("refine_instruction", "")
    approval_notes = state.get("approval_result", {}).get("notes", "")
    theme = brief.get("title") or brief.get("event", "campaign")

    logger.info(f"[CONTENT GEN ▶] Caption agent — theme: {theme!r}, model: {_GEMINI_PRO}")
    prompt = _caption_prompt(ctx, brief, refine or approval_notes)
    response = _client.models.generate_content(
        model=_GEMINI_PRO,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", temperature=0.8
        ),
    )
    captions = json.loads(response.text)
    raw = captions[:3] if isinstance(captions, list) else [response.text]
    # Strip markdown emphasis characters (Gemini sometimes outputs *word* or **word**)
    result = [c.replace('**', '').replace('*', '') if isinstance(c, str) else c for c in raw]
    logger.info(f"[CONTENT GEN ▶] Caption agent — {len(result)} captions generated")
    return result


def _run_email_agent(state: GraphState) -> list[dict]:
    ctx = state["user_context"]
    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    refine = state.get("refine_instruction", "")
    approval_notes = state.get("approval_result", {}).get("notes", "")
    theme = brief.get("title") or brief.get("event", "campaign")

    logger.info(f"[CONTENT GEN ▶] Email agent — theme: {theme!r}, model: {_GEMINI_PRO}")
    prompt = _email_prompt(ctx, brief, refine or approval_notes)
    response = _client.models.generate_content(
        model=_GEMINI_PRO,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", temperature=0.8
        ),
    )
    emails = json.loads(response.text)
    raw = emails[:3] if isinstance(emails, list) else []
    # Strip HTML, markdown bold/italic, and placeholder brackets from email content
    result = [
        {
            "subject": _clean_email_text(e.get("subject", "")) if isinstance(e, dict) else "",
            "body": _clean_email_text(e.get("body", "")) if isinstance(e, dict) else "",
        }
        for e in raw
        if isinstance(e, dict)
    ]
    logger.info(f"[CONTENT GEN ▶] Email agent — {len(result)} emails generated")
    return result


# ── Node ──────────────────────────────────────────────────────────────────────

def content_generator_node(state: GraphState) -> dict:
    channels = state.get("channels", [])
    iteration = state.get("iteration_count", 0)
    regen_image = state.get("regenerate_image", True)
    regen_caption = state.get("regenerate_caption", True)
    regen_email = state.get("regenerate_email", True)

    logger.info("=" * 60)
    logger.info(f"[CONTENT GEN ▶] Node started — iteration {iteration + 1}, channels={channels}")
    logger.info(f"[CONTENT GEN ▶] Regen flags: image={regen_image}, caption={regen_caption}, email={regen_email}")

    updates: dict = {"iteration_count": iteration + 1}

    if "instagram" in channels:
        if regen_image:
            logger.info("[CONTENT GEN ▶] Generating images...")
            updates["generated_images"] = _run_image_agent(state)
        else:
            logger.info("[CONTENT GEN ▶] Skipping image (regen_image=False)")
        if regen_caption:
            logger.info("[CONTENT GEN ▶] Generating captions...")
            updates["generated_captions"] = _run_caption_agent(state)
        else:
            logger.info("[CONTENT GEN ▶] Skipping captions (regen_caption=False)")

    if "email" in channels:
        if regen_email:
            logger.info("[CONTENT GEN ▶] Generating emails...")
            updates["generated_emails"] = _run_email_agent(state)
        else:
            logger.info("[CONTENT GEN ▶] Skipping emails (regen_email=False)")

    updates["regenerate_image"] = False
    updates["regenerate_caption"] = False
    updates["regenerate_email"] = False
    updates["refine_instruction"] = ""

    logger.info("[CONTENT GEN ▶] Node complete")
    return updates
