import json
import logging
import random
import re
import time

import httpx
from google import genai
from google.genai import types

from config import settings
from db.storage import upload_generated_image, read_gcs_bytes
from agents.state import GraphState

logger = logging.getLogger(__name__)

_client = genai.Client(vertexai=True, project=settings.GCP_PROJECT_ID, location="us-central1")
_IMAGEN_MODEL = "imagen-4.0-generate-001"
_GEMINI_FLASH_IMAGE = "gemini-2.5-flash-image"
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


_FONT_STYLES: dict[str, str] = {
    "Dancing Script":      "flowing cursive handwriting with fluid elegant loops",
    "Great Vibes":         "luxurious flowing script with sweeping decorative curves",
    "Cormorant Garamond":  "high-contrast thin serif with refined classical elegance",
    "Playfair Display":    "classic high-contrast serif with editorial sophistication",
    "Bebas Neue":          "bold condensed all-caps geometric display lettering",
    "Montserrat Bold":     "strong modern geometric sans-serif, clean and impactful",
    "Raleway":             "elegant thin geometric sans-serif with delicate letterforms",
    "Lato Light":          "delicate thin humanist sans-serif, soft and approachable",
    "Open Sans":           "clean neutral humanist sans-serif, highly readable",
    "Roboto":              "modern neutral geometric sans-serif",
    "Nunito":              "rounded friendly sans-serif with soft terminals",
    "Lora":                "contemporary serif with calligraphic brushed curves",
    "Merriweather":        "sturdy slab serif designed for high readability",
}


def _font_desc(font_name: str | None) -> str:
    if not font_name:
        return ""
    style = _FONT_STYLES.get(font_name, "")
    return f"{font_name} — {style}" if style else font_name


def _describe_colors(brand_colors_json: str | None) -> str:
    """Pick one random color from the brand palette and return a natural-language name."""
    try:
        colors = json.loads(brand_colors_json or "{}")
    except Exception:
        return ""
    # New format: {"colors": ["#hex1", "#hex2", "#hex3", "#hex4"]}
    color_list = colors.get("colors", [])
    if color_list:
        chosen = random.choice([c for c in color_list if c])
        return _hex_to_color_name(chosen)
    # Legacy format: {"primary": "#...", "secondary": "#..."}
    if colors.get("primary"):
        return _hex_to_color_name(colors["primary"])
    return ""


def _build_occasion_context(brief: dict) -> str:
    """Build a rich occasion context string from enriched brief data."""
    ctx_data = brief.get("context", {})
    if not ctx_data:
        return ""
    parts = []
    themes = ctx_data.get("themes", [])
    if themes:
        parts.append(f"Occasion themes: {', '.join(themes)}")
    mood = ctx_data.get("mood", "")
    if mood:
        parts.append(f"Mood: {mood}")
    elements = ctx_data.get("visual_elements", [])
    if elements:
        parts.append(f"Visual motifs to incorporate: {', '.join(elements)}")
    colors = ctx_data.get("color_suggestions", "")
    if colors:
        parts.append(f"Occasion color palette: {colors}")
    angles = ctx_data.get("content_angles", [])
    if angles:
        parts.append(f"Content angles: {', '.join(angles)}")
    return ". ".join(parts) + "." if parts else ""


def _strip_markdown(text: str) -> str:
    text = re.sub(r'\*+', '', text)
    text = re.sub(r'#+\s*', '', text)
    text = re.sub(r'_{2,}', '', text)
    return text.strip()


def _image_prompt(ctx, brief: dict, refine: str = "") -> str:
    theme = brief.get("title") or brief.get("event", "")

    brand_angle = brief.get("brand_angle", "")
    visual_direction = brief.get("visual_direction", "")  # trend-specific scene description
    detail = brand_angle or brief.get("notes", "")

    if not brand_angle:
        # Occasion mode: enrich with offer/products/visual direction
        if brief.get("message"):
            detail = f"{detail} Key message: {brief['message']}." if detail else f"Key message: {brief['message']}."
        if brief.get("products"):
            detail = f"{detail} Feature: {brief['products']}." if detail else f"Feature: {brief['products']}."
        if brief.get("visual_notes"):
            detail = f"{detail} Visual direction: {brief['visual_notes']}." if detail else brief["visual_notes"]

    occasion_context = _build_occasion_context(brief)
    if occasion_context:
        detail = f"{detail} {occasion_context}" if detail else occasion_context

    color_desc = _describe_colors(ctx.brand_colors)

    text_elements = [
        f"'{ctx.business_name}' as a dedicated text element placed in a corner or along an edge — "
        f"NEVER printed on clothing, accessories, or any object in the scene"
    ]
    if ctx.tagline:
        text_elements.append(
            f"the tagline '{ctx.tagline}' displayed as styled overlay text — "
            f"NEVER printed on clothing or objects"
        )
    text_rule = (
        "Text placement rules (strictly follow — violations are critical): "
        "Brand name and tagline must appear as dedicated graphic text overlays, "
        "NOT printed on garments, hats, bags, or any prop in the scene. "
        "Each element appears exactly once: " + " | ".join(text_elements) + "."
    )

    typography_parts = []
    if ctx.brand_font:
        typography_parts.append(f"brand name in {_font_desc(ctx.brand_font)}")
    if ctx.tagline_font:
        typography_parts.append(f"tagline in {_font_desc(ctx.tagline_font)}")
    if ctx.body_font:
        typography_parts.append(f"any other text in {_font_desc(ctx.body_font)}")
    typography_rule = "Typography (strictly follow): " + ", ".join(typography_parts) + "." if typography_parts else ""

    # Strip markdown artifacts (asterisks, hashes) that LLMs sometimes include
    headline = _strip_markdown(brief.get("headline", ""))

    # Brand-first framing for trend campaigns
    brand_first = (
        f"This is a marketing advertisement for {ctx.business_name}. "
        f"The image must combine two things: (1) the visual world of the '{theme}' trend — "
        f"the scene, setting, and atmosphere described below — and (2) {ctx.business_name}'s brand identity "
        f"(name, tagline, and logo) clearly present as graphic overlays."
    ) if brand_angle else ""

    # Layout planning instruction — model decides composition before rendering
    layout_plan = (
        "Before generating, plan the layout: "
        "Decide (1) where the hero visual goes — full bleed, left panel, or center. "
        "(2) Where the brand name and tagline sit as graphic overlays — top bar, corner, or bottom strip. "
        "(3) Where the marketing copy sits — naturally embedded within the image, not in a separate box. "
        "(4) For text legibility, use the natural scene — darken part of the image, use a subtle gradient veil, "
        "or position text over a naturally contrasting area. "
        "CRITICAL: Do NOT add a white or opaque solid-colored background box, banner, or strip behind any text — "
        "all text should feel embedded in the image, not pasted on top of a separate panel. "
        "Generate the image with this plan fully executed, so every text element reads clearly and feels intentional."
    )

    size_rule = (
        "Text size hierarchy (strictly follow): "
        "Brand name is the largest text element. "
        "Tagline is noticeably smaller than the brand name — roughly 60-70% of its size. "
        "Marketing copy lines are the smallest — elegant, refined, clearly smaller than both brand name and tagline."
    )

    lines = [
        f"Generate a professional Instagram marketing advertisement for {ctx.business_name}, a {ctx.industry} business.",
        brand_first,
        f"Campaign theme: {theme}.",
        f"Visual scene to depict: {visual_direction}" if visual_direction else "",
        detail or "",
        layout_plan,
        size_rule,
        typography_rule,
        f"Visual style: {ctx.image_style or 'Photorealistic'}.",
        f"Brand tone: {ctx.tone or 'Professional'}.",
        f"Color palette: build a cohesive palette inspired by {color_desc} — use shades, tints, and complementary tones of this color that suit the theme, not just the single color alone." if color_desc else "",
        f"Target audience: {ctx.target_audience}." if ctx.target_audience else "",
        "Square 1:1 format. High quality, compelling composition suitable for Instagram.",
        text_rule,
        (
            f"Marketing copy — display these exact lines as styled text naturally integrated into the image scene "
            f"(smaller than the brand name, elegantly sized, positioned in a planned area — "
            f"DO NOT place on a white box or opaque background strip): "
            f"{headline}. "
            f"Each line on its own. The words must be spelled correctly and read naturally. "
            f"Do not print the word 'headline' or any instruction label — only the copy itself."
        ) if headline else "",
        f"Additional instruction: {refine}" if refine else "",
    ]
    return "\n".join(l for l in lines if l)



def _imagen_prompt(ctx, brief: dict, refine: str = "") -> str:
    """Clean natural-language prompt for Imagen 4.0.

    Imagen renders structured instruction labels as literal text on the image,
    so this prompt avoids any labeled sections. No logo instructions either —
    Imagen cannot composite an external image.
    """
    theme = brief.get("title") or brief.get("event", "")
    brand_angle = brief.get("brand_angle", "")
    visual_direction = brief.get("visual_direction", "")
    detail = brand_angle or brief.get("notes", "")

    if not brand_angle:
        if brief.get("message"):
            detail = f"{detail} {brief['message']}." if detail else brief["message"] + "."
        if brief.get("products"):
            detail = f"{detail} Featuring {brief['products']}." if detail else f"Featuring {brief['products']}."
        if brief.get("visual_notes"):
            detail = f"{detail} {brief['visual_notes']}." if detail else brief["visual_notes"] + "."

    occasion_ctx = _build_occasion_context(brief)
    if occasion_ctx:
        detail = f"{detail} {occasion_ctx}" if detail else occasion_ctx

    headline = _strip_markdown(brief.get("headline", ""))
    color_desc = _describe_colors(ctx.brand_colors)

    # Build one flowing paragraph — no labeled sections, no colons introducing categories
    scene = (
        f"A {ctx.image_style or 'photorealistic'} Instagram marketing image for "
        f"{ctx.business_name}, a {ctx.industry} brand"
        + (f" with a {ctx.tone.lower()} vibe" if ctx.tone else "")
        + "."
    )
    visual_line = f"Scene to depict: {visual_direction}" if visual_direction else ""
    theme_line = f"Campaign theme: {theme}. {detail}".strip() if theme else (detail or "")
    color_line = (
        f"Color palette built around {color_desc} — rich tones and complementary shades that suit the theme."
        if color_desc else ""
    )
    audience_line = f"Targeted at {ctx.target_audience}." if ctx.target_audience else ""

    # Brand name and tagline as copy lines — just the values, no instruction labels
    copy_parts = [f"Brand name: {ctx.business_name} (largest text, most prominent)"]
    if ctx.tagline:
        copy_parts.append(f"tagline: {ctx.tagline} (smaller than brand name, roughly 60-70% of its size)")
    if headline:
        copy_parts.append(f"marketing copy: {headline} (smallest text — elegant, refined, clearly smaller than both brand name and tagline)")
    copy_line = (
        "Embed these as styled text overlays directly on the image scene — do NOT place any text on a white box, "
        "opaque banner, or solid-colored background strip. Text should feel naturally part of the image. "
        "Use the scene itself (a naturally dark or contrasting area, or a subtle gradient) for legibility. "
        + ", ".join(copy_parts)
        + ". Spell every word correctly."
    )

    refine_line = f"Also apply: {refine}" if refine else ""

    lines = [
        scene,
        visual_line,
        theme_line,
        color_line,
        audience_line,
        "Square 1:1 format. High visual impact, suitable for Instagram.",
        copy_line,
        refine_line,
    ]
    return " ".join(l for l in lines if l)


def _caption_prompt(ctx, brief: dict, refine: str = "") -> str:
    theme = brief.get("title") or brief.get("event", "")
    hashtag_hint = ", ".join(brief.get("hashtags", []))
    occasion_context = _build_occasion_context(brief)
    event_details = " | ".join(filter(None, [
        brief.get("date") and f"Date: {brief['date']}",
        brief.get("message") and f"Offer/Message: {brief['message']}",
        brief.get("products") and f"Products: {brief['products']}",
    ]))
    return f"""Generate 3 distinct Instagram captions for {ctx.business_name}, a {ctx.industry} business.

Campaign theme: {theme}
{"Event details: " + event_details if event_details else ""}
{"Occasion context: " + occasion_context if occasion_context else ""}
Tone: {ctx.tone or 'Professional'}
Language: {ctx.language or 'English'}
Target audience: {ctx.target_audience or 'general audience'}
{"Tagline: " + ctx.tagline if ctx.tagline else ""}
{"Include these hashtags: " + hashtag_hint if hashtag_hint else ""}
{"Topics to avoid: " + ctx.guidelines if ctx.guidelines else ""}
{"Refinement: " + refine if refine else ""}

Use the occasion context to weave in culturally relevant references, emotions, and themes.
Make each caption different in style: one punchy, one storytelling, one question-based.
End each with 8-12 relevant hashtags.

IMPORTANT: Write plain text only. Do NOT use asterisks (*), bold (**), italics, or any markdown formatting. No special characters for emphasis — just natural Instagram-style prose.

Return ONLY a raw JSON array of 3 strings, no markdown:
["caption 1\\n\\n#tag1 #tag2", "caption 2\\n\\n#tag1 #tag2", "caption 3\\n\\n#tag1 #tag2"]"""


def _email_prompt(ctx, brief: dict, refine: str = "") -> str:
    theme = brief.get("title") or brief.get("event", "")
    occasion_context = _build_occasion_context(brief)
    return f"""Generate 3 marketing emails for {ctx.business_name}, a {ctx.industry} business.

Campaign theme: {theme}
{"Occasion context: " + occasion_context if occasion_context else ""}
{"Key message/offer: " + brief.get("message") if brief.get("message") else ""}
{"Products/services: " + brief.get("products") if brief.get("products") else ""}
Sender: {ctx.sender_name or ctx.business_name}
Tone: {ctx.tone or 'Professional'}
Language: {ctx.language or 'English'}
Target audience: {ctx.target_audience or 'general audience'}
{"Tagline: " + ctx.tagline if ctx.tagline else ""}
{"Topics to avoid: " + ctx.guidelines if ctx.guidelines else ""}
{"Refinement: " + refine if refine else ""}

Use the occasion context to write emails that feel culturally resonant and timely.
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

class GeminiRateLimitError(Exception):
    pass


def _is_rate_limit(exc: Exception) -> bool:
    s = str(exc)
    return "429" in s or "RESOURCE_EXHAUSTED" in s


def _call_with_backoff(call_fn):
    """Try call_fn(). On 429: retry after 25 s, then 30 s. After 3 failures raise GeminiRateLimitError."""
    last_exc: Exception | None = None
    try:
        return call_fn()
    except Exception as exc:
        if not _is_rate_limit(exc):
            raise
        last_exc = exc

    for delay in (25, 30):
        logger.info(f"[CONTENT GEN ▶] 429 rate limit — retrying after {delay}s")
        time.sleep(delay)
        try:
            return call_fn()
        except Exception as exc:
            if not _is_rate_limit(exc):
                raise
            last_exc = exc

    raise GeminiRateLimitError(str(last_exc))


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
        logger.info(f"[CONTENT GEN ▶] Gemini Flash — reading brand asset from GCS: {asset_url[:60]}...")
        asset_bytes, mime_type = read_gcs_bytes(asset_url)
        if mime_type not in _ALLOWED_MIME_TYPES:
            mime_type = "image/png"
        logger.info(f"[CONTENT GEN ▶] Brand asset read ({len(asset_bytes)} bytes, {mime_type}) — generating {count} variations")

        results: list[bytes] = []
        for i in range(count):
            if i > 0:
                logger.info(f"[CONTENT GEN ▶] Gemini Flash — waiting 15s before variation {i + 1}")
                time.sleep(15)
            logger.info(f"[CONTENT GEN ▶] Gemini Flash — variation {i + 1}/{count}")
            variation_prompt = (
                "MANDATORY — THE ATTACHED IMAGE IS THE BRAND LOGO AND MUST APPEAR IN THE FINAL OUTPUT.\n"
                "This is non-negotiable: the logo graphic from the attached image must be visibly embedded "
                "in the generated image. An output without the logo is a failure and must not be produced.\n\n"
                "LOGO RULES:\n"
                "- Place the logo graphic in one corner or along the top/bottom edge "
                "(top-left, top-right, bottom-left, or bottom-right). Size: ~12% of the image.\n"
                "- Logo background must be fully transparent — blend seamlessly into the scene behind it. "
                "No white fill, no rectangle, no bounding box, no shadow behind the logo.\n"
                "- Embed the actual logo image — do not replace it with text or a drawn shape.\n\n"
                f"{prompt}\n\n"
                "FINAL CHECK — every item below MUST be true before outputting the image:\n"
                "[ ] Logo graphic from the attached image is VISIBLE in a corner or edge — REQUIRED\n"
                "[ ] Logo has NO white/filled background — transparent blend only\n"
                "[ ] Brand name appears as text overlay\n"
                "[ ] Brand tagline appears as styled text overlay\n"
                "[ ] Marketing copy is present and readable\n"
                "[ ] No instruction labels rendered as visible text\n"
                "If the logo is missing from the output, regenerate until it is present."
            )

            def _do_generate(vp=variation_prompt, ab=asset_bytes, mt=mime_type):
                resp = _client.models.generate_content(
                    model=_GEMINI_FLASH_IMAGE,
                    contents=[
                        types.Part(inline_data=types.Blob(mime_type=mt, data=ab)),
                        types.Part(text=vp),
                    ],
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"],
                    ),
                )
                return resp

            response = _call_with_backoff(_do_generate)
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if getattr(part, "inline_data", None):
                        results.append(part.inline_data.data)
                        break
        if results:
            logger.info(f"[CONTENT GEN ▶] Gemini Flash — {len(results)} images generated")
            return results
        raise ValueError("No image parts in Gemini Flash response")
    except GeminiRateLimitError:
        raise
    except Exception as exc:
        if _is_rate_limit(exc):
            logger.warning(f"[CONTENT GEN ▶] Gemini Flash rate limited (429) — exhausted retries")
            raise GeminiRateLimitError(str(exc))
        logger.warning(f"[CONTENT GEN ▶] Gemini Flash failed ({exc}) — raising for caller to handle fallback")
        raise


# ── Sub-agents ────────────────────────────────────────────────────────────────

def _run_image_generate_agent(state: GraphState, force_imagen: bool = False) -> list[str]:
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

    fix_instruction = state.get("approval_result", {}).get("fix_instruction", "")
    effective_refine = refine or fix_instruction
    brand_asset_url = ctx.logo_gcs_url or ctx.image_url

    if brand_asset_url and not force_imagen:
        gemini_prompt = _image_prompt(ctx, brief, effective_refine)
        logger.info(f"[CONTENT GEN ▶] Image agent — using Gemini Flash (logo: {brand_asset_url[:60]}...)")
        try:
            image_bytes_list = _gemini_flash_image(gemini_prompt, brand_asset_url)
        except GeminiRateLimitError:
            raise  # propagate to content_generator_node for rate-limit handling
        except Exception as exc:
            logger.warning(f"[CONTENT GEN ▶] Gemini Flash error ({exc}) — falling back to Imagen 4.0")
            imagen_p = _imagen_prompt(ctx, brief, effective_refine)
            image_bytes_list = _imagen(imagen_p)
    else:
        # Imagen can't follow structured instruction labels — use a clean natural-language prompt
        imagen_p = _imagen_prompt(ctx, brief, effective_refine)
        logger.info(f"[CONTENT GEN ▶] Image agent — using Imagen 4.0{' (forced fallback)' if force_imagen else ''}")
        image_bytes_list = _imagen(imagen_p)

    logger.info(f"[CONTENT GEN ▶] Image agent — uploading {len(image_bytes_list)} images to GCS")
    urls = [upload_generated_image(b, ctx.user_id) for b in image_bytes_list]
    logger.info(f"[CONTENT GEN ▶] Image agent — done. URLs: {urls}")
    return urls


def _run_caption_agent(state: GraphState) -> list[str]:
    ctx = state["user_context"]
    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    refine = state.get("refine_instruction", "")
    fix_instruction = state.get("approval_result", {}).get("fix_instruction", "")
    theme = brief.get("title") or brief.get("event", "campaign")

    logger.info(f"[CONTENT GEN ▶] Caption agent — theme: {theme!r}, model: {_GEMINI_PRO}")
    prompt = _caption_prompt(ctx, brief, refine or fix_instruction)
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
    fix_instruction = state.get("approval_result", {}).get("fix_instruction", "")
    theme = brief.get("title") or brief.get("event", "campaign")

    logger.info(f"[CONTENT GEN ▶] Email agent — theme: {theme!r}, model: {_GEMINI_PRO}")
    prompt = _email_prompt(ctx, brief, refine or fix_instruction)
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

# ── Image edit helpers ─────────────────────────────────────────────────────────

def _edit_image_with_gemini(
    image_bytes: bytes,
    edit_prompt: str,
    logo_bytes: bytes | None = None,
    logo_mime: str = "image/png",
) -> bytes:
    contents: list = [types.Part.from_bytes(data=image_bytes, mime_type="image/png")]
    if logo_bytes:
        contents.append(types.Part(inline_data=types.Blob(mime_type=logo_mime, data=logo_bytes)))
    contents.append(types.Part.from_text(text=edit_prompt))
    response = _client.models.generate_content(
        model=_GEMINI_FLASH_IMAGE,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            temperature=0.3,
        ),
    )
    for candidate in response.candidates:
        for part in candidate.content.parts:
            if getattr(part, "inline_data", None):
                return part.inline_data.data
    raise ValueError("Gemini edit returned no image")


def _build_edit_prompt(ctx, brief: dict, issues: list[str], refine: str, has_logo: bool = False) -> str:
    theme = brief.get("title") or brief.get("event", "")
    fix_text = "; ".join(issues) if issues else refine
    theme_clause = f" Maintain the campaign theme '{theme}' and brand identity." if theme else " Maintain brand identity."
    logo_clause = (
        " A second image is provided — that is the brand logo. "
        "Embed it as a graphic at roughly 15% of the image size, placed in a corner. "
        "The logo has a transparent background — blend it seamlessly with no white box behind it."
    ) if has_logo else ""
    return (
        f"Edit this Instagram marketing image for {ctx.business_name}. "
        f"Keep the overall layout and composition intact except where the changes below require adjustments."
        f"{logo_clause} "
        f"Apply the following changes: {fix_text}."
        f"{theme_clause}"
    )


def _run_image_edit_agent(state: GraphState) -> list[str]:
    ctx = state["user_context"]
    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    existing_images = state.get("generated_images", [])

    # Resolve instruction + target for this edit pass:
    # Fresh refine: use refine_instruction + selected_image_for_refine (URL-based targeting)
    # Approval retry of a user refine: fall back to last_* fields (index-based targeting)
    # Pure approval retry (no user refine): refine = "" and target = None → edit all by per-item issues
    refine = state.get("refine_instruction", "") or state.get("last_refine_instruction", "")
    refine_target = state.get("selected_image_for_refine")  # URL → set on fresh refine only
    last_edited_index = state.get("last_edited_image_index")  # int → persists across retries

    per_item = state.get("approval_result", {}).get("per_item", [])
    image_items = [it for it in per_item if it.get("type") == "image"]

    # Load brand logo once so we can pass it into Gemini alongside each edited image
    brand_asset_url = ctx.logo_gcs_url or ctx.image_url
    logo_bytes: bytes | None = None
    logo_mime = "image/png"
    if brand_asset_url:
        try:
            logo_bytes, logo_mime = read_gcs_bytes(brand_asset_url)
            if logo_mime not in _ALLOWED_MIME_TYPES:
                logo_mime = "image/png"
            logger.info(f"[CONTENT GEN ▶] Edit mode — logo loaded ({len(logo_bytes)} bytes)")
        except Exception as exc:
            logger.warning(f"[CONTENT GEN ▶] Edit mode — could not load logo ({exc})")

    urls: list[str] = []
    for i, image_url in enumerate(existing_images):
        # Determine whether this image should be skipped:
        # - Fresh refine: skip if URL doesn't match the selected image
        # - Retry of a user refine: skip if index doesn't match the persisted target index
        # - Pure approval retry (no user target): edit all images
        skip = False
        if refine_target:
            skip = (image_url != refine_target)
        elif last_edited_index is not None:
            skip = (i != last_edited_index)

        if skip:
            logger.info(f"[CONTENT GEN ▶] Edit mode — keeping image {i+1} (not selected for refine)")
            urls.append(image_url)
            continue

        if i > 0:
            logger.info(f"[CONTENT GEN ▶] Edit mode — waiting 15s before image {i+1}")
            time.sleep(15)

        issues = image_items[i].get("issues", []) if i < len(image_items) else []
        edit_prompt = _build_edit_prompt(ctx, brief, issues, refine, has_logo=bool(logo_bytes))
        logger.info(f"[CONTENT GEN ▶] Edit mode — editing image {i+1}/{len(existing_images)}: {edit_prompt[:100]!r}")

        try:
            image_bytes = httpx.get(image_url, timeout=15, follow_redirects=True).content
            edited_bytes = _call_with_backoff(
                lambda ib=image_bytes, ep=edit_prompt, lb=logo_bytes, lm=logo_mime:
                    _edit_image_with_gemini(ib, ep, lb, lm)
            )
        except GeminiRateLimitError:
            logger.warning(f"[CONTENT GEN ▶] Rate limit on edit — keeping original image {i+1}")
            urls.append(image_url)
            continue
        except Exception as exc:
            logger.warning(f"[CONTENT GEN ▶] Edit failed for image {i+1} ({exc}) — keeping original")
            urls.append(image_url)
            continue

        url = upload_generated_image(edited_bytes, ctx.user_id)
        logger.info(f"[CONTENT GEN ▶] Edit mode — image {i+1} uploaded: {url[:60]}")
        urls.append(url)

    return urls


# ── Node ──────────────────────────────────────────────────────────────────────

def content_generator_node(state: GraphState) -> dict:
    channels = state.get("channels", [])
    iteration = state.get("iteration_count", 0)
    regen_image = state.get("regenerate_image", True)
    regen_caption = state.get("regenerate_caption", True)
    regen_email = state.get("regenerate_email", True)

    # Fresh user refine: refine_instruction is set → capture target image index now, before clearing
    # Approval retry: refine_instruction is empty → keep existing last_* fields alive in state
    fresh_refine_instruction = state.get("refine_instruction", "")
    fresh_refine_target = state.get("selected_image_for_refine")
    existing_images_before_edit = state.get("generated_images") or []

    is_fresh_user_refine = bool(fresh_refine_instruction and fresh_refine_target)
    if is_fresh_user_refine:
        last_edited_image_index: int | None = next(
            (i for i, url in enumerate(existing_images_before_edit) if url == fresh_refine_target),
            None,
        )
        last_refine_instruction = fresh_refine_instruction
    else:
        # Approval retry — inherit from state so the loop stays targeted on the same image
        last_edited_image_index = state.get("last_edited_image_index")
        last_refine_instruction = state.get("last_refine_instruction", "")

    logger.info("=" * 60)
    logger.info(f"[CONTENT GEN ▶] Node started — iteration {iteration + 1}, channels={channels}")
    logger.info(f"[CONTENT GEN ▶] Regen flags: image={regen_image}, caption={regen_caption}, email={regen_email}")

    updates: dict = {"iteration_count": iteration + 1}

    if "instagram" in channels:
        if regen_image:
            existing_images = state.get("generated_images") or []
            use_edit_mode = bool(existing_images) and iteration > 0

            if use_edit_mode:
                logger.info("[CONTENT GEN ▶] Edit mode — modifying existing images")
                updates["generated_images"] = _run_image_edit_agent(state)
            else:
                logger.info("[CONTENT GEN ▶] Generate mode — creating images from scratch")
                try:
                    updates["generated_images"] = _run_image_generate_agent(state)
                except GeminiRateLimitError:
                    if existing_images:
                        logger.warning("[CONTENT GEN ▶] Rate limit hit — keeping existing images")
                        updates["approval_result"] = {
                            "passed": True, "score": 0,
                            "notes": "Image generation paused due to rate limit — displaying existing results.",
                            "fix_instruction": "", "per_item": [],
                        }
                        updates["regenerate_image"] = False
                        updates["regenerate_caption"] = False
                        updates["regenerate_email"] = False
                        updates["refine_instruction"] = ""
                        updates["selected_image_for_refine"] = None
                        logger.info("[CONTENT GEN ▶] Node complete (early exit — rate limit)")
                        return updates
                    else:
                        logger.warning("[CONTENT GEN ▶] Rate limit on first iteration — falling back to Imagen 4.0")
                        updates["generated_images"] = _run_image_generate_agent(state, force_imagen=True)
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
    updates["selected_image_for_refine"] = None
    updates["last_refine_instruction"] = last_refine_instruction
    updates["last_edited_image_index"] = last_edited_image_index

    logger.info("[CONTENT GEN ▶] Node complete")
    return updates
