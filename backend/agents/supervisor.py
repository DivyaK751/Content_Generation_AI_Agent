import json
import logging

from google import genai
from google.genai import types
from langgraph.types import interrupt

from config import settings
from agents.state import GraphState

logger = logging.getLogger(__name__)

_client = genai.Client(vertexai=True, project=settings.GCP_PROJECT_ID, location="us-central1")
# _MODEL = "gemini-2.5-pro"
_MODEL = "gemini-2.5-flash-lite"

# ── Prompts ────────────────────────────────────────────────────────────────────

_INTENT_PROMPT = """You are a smart, friendly marketing assistant chatbot for {business_name}, a {industry} business.

BUSINESS:
- Name: {business_name}
- Industry: {industry}
- Description: {description}

CONVERSATION SO FAR (most recent last — use this to understand context):
{history}

LATEST USER MESSAGE: "{user_input}"

---

Classify the LATEST USER MESSAGE. Use conversation history to understand what was already said.

CATEGORY 1 — CHAT
Casual messages: greetings, small talk, acknowledgments, thanks.
CRITICAL RULES:
- If the assistant already greeted the user, do NOT greet again. Move forward naturally — ask what they want to create.
- If history shows the assistant offered to help and user replies "yes" / "ok" / "sure" / "great" → classify as CATEGORY 3 (content, mode=unknown), NOT chat.
- Reply must be context-aware — reference the conversation, not a generic hello.
→ 1–2 sentence warm reply. Never open with "Welcome to {business_name}".

CATEGORY 2 — OFF_TOPIC
Completely unrelated to marketing or the business.
→ Politely redirect.

CATEGORY 3 — CONTENT
User wants to create marketing content. Sub-classify mode:
- "trend": explicitly wants trend-based content
- "occasion": user names a SPECIFIC real-world event — a calendar holiday (Mother's Day, Diwali, Christmas, Valentine's Day), a business milestone (product launch, store anniversary), or a named sale/campaign with a clear identity. The event must be something with cultural or calendar meaning, NOT a vague content goal.
- "unknown": direction unclear, vague theme, or user is asking for ideas/suggestions

CRITICAL — DO NOT classify these as "occasion":
  - Vague marketing goals: "weekend engagement", "brand awareness", "morning freshness", "boost followers"
  - General themes without a specific event: "something fun", "a lifestyle post", "summer vibes"
  - These should be mode="unknown" with follow_up_needed=true, asking whether they want trend-based or occasion-based content.

IDEAS REQUEST: If user says "any ideas?", "what do you suggest?", "what can I do?", "help me think", or asks for creative options — even if they mention a specific occasion — set mode="unknown", follow_up_needed=true, and write a follow_up_question that offers concrete paths. Example: "I can build a trend-based post riding what's popular right now, or create something tailored for [occasion] — which direction feels right for {business_name}?"

CATEGORY 4 — UNKNOWN
Cannot determine intent.

CATEGORY 5 — CONTEXT_QUERY
User asks about the current session — why images look a certain way, what trend was picked, etc.
→ Mark context_query. Do NOT generate the answer here.

---

Return ONLY valid JSON, no markdown:
{{
  "category": "chat" | "off_topic" | "content" | "unknown" | "context_query",
  "chat_response": "context-aware reply — never a repeated greeting (only when category=chat, else null)",
  "redirect_message": "polite redirect (only when category=off_topic, else null)",
  "mode": "trend" | "occasion" | "unknown" | null,
  "channels": ["instagram"] | ["email"] | ["instagram", "email"] | ["unknown"] | null,
  "occasion_brief": {{"event": "...", "date": "...", "notes": "..."}} | null,
  "follow_up_needed": true | false,
  "follow_up_question": "specific options question (only when follow_up_needed=true, else null)"
}}"""

_CONTEXT_QA_PROMPT = """You are a helpful marketing assistant for {business_name}.

The user has a question about the current content generation session. Use only the context below — do not invent information.

SESSION CONTEXT:
{context_summary}

USER QUESTION: "{user_question}"

Answer in 2–4 conversational sentences. Be specific and helpful — if the answer is in the context, give it directly. If not, say so honestly and offer to help with something else."""

_EVENT_ENRICH_PROMPT = """You are a creative marketing strategist with deep cultural, seasonal, and commercial knowledge.

A business wants to run a campaign around a specific event or occasion. Use your knowledge to generate rich contextual information that will power highly relevant marketing content.

EVENT / OCCASION: {event}
BUSINESS: {business_name} ({industry})

Think deeply: What does this event mean culturally? What emotions does it evoke? What do people do, buy, celebrate? What visual motifs are associated with it? What kinds of offers work well?

Return ONLY a JSON object, no markdown:
{{
  "themes": ["key theme 1", "key theme 2", "key theme 3", "key theme 4"],
  "mood": "overall emotional tone — e.g. vibrant and celebratory, cosy and warm, bold and energetic",
  "visual_elements": ["visual motif 1", "visual motif 2", "visual motif 3", "visual motif 4"],
  "cultural_context": "2-3 sentences on why this event matters and what it represents",
  "typical_offers": ["common offer type 1", "common offer type 2", "common offer type 3"],
  "color_suggestions": "color palette that resonates with this event (natural language, no hex codes)",
  "content_angles": ["creative angle 1", "creative angle 2", "creative angle 3"]
}}"""

_OCCASION_GATHER_PROMPT = """You are a friendly marketing assistant helping a business owner launch a campaign.

BUSINESS: {business_name} ({industry})
OCCASION: {event}
WHAT YOU KNOW ABOUT THIS EVENT:
- Themes: {themes}
- Mood: {mood}
- Typical offers businesses run: {typical_offers}

CONVERSATION SO FAR:
{history}

You already know everything about this event culturally and commercially. What you DON'T know yet is what this specific business wants to do — their offer, their products, their personal angle.

Write a SHORT (2–3 sentence), warm, conversational message asking only for:
1. Their specific deal, offer, or key message (reference a couple of typical offers as examples to inspire them)
2. Any products or services they want to spotlight (optional)
3. Any personal visual preference beyond the usual event mood (optional)

STRICT RULES:
- Do NOT open with any greeting ("Hey!", "Hey there!", "Hi!", "Great!") — the conversation is already underway. Dive straight into the question.
- Do not use bullet points.
- Do not use the business name as a salutation.
- Keep it natural and warm but get straight to the point.

Return ONLY the message text, nothing else."""

_OCCASION_PARSE_PROMPT = """You are building a rich content brief for a marketing campaign.

BUSINESS: {business_name} ({industry})
OCCASION: {event}

CULTURAL & THEMATIC CONTEXT (from your knowledge):
Themes: {themes}
Mood: {mood}
Visual elements: {visual_elements}
Color palette: {color_suggestions}
Content angles: {content_angles}

BUSINESS-SPECIFIC DETAILS (from the user):
"{user_answers}"

Combine the event's cultural richness with the user's business-specific details into a comprehensive brief.

IMPORTANT: If the user's answer specifies a different or more specific event than the original occasion (e.g. they said "christmas" when the original was "New Beginnings", or "Diwali" when it was "festival"), update the event field to match what the user actually said. Always trust the user's stated event over the original classification.

RAW INPUT CLEANUP RULES — the user's input is rough notes, always transform it:
- Strip label prefixes verbatim: "Offer: BOGO" → "Buy One Get One Free", "Theme:" → remove the label
- Rephrase shorthand into natural marketing language: "BOGO" → "Buy One, Get One Free", "20% off" → "Enjoy 20% Off"
- If the user says "something like [tagline]", treat it as creative direction and craft a polished version — do not copy it word for word
- Never put a raw label like "Offer:", "Theme:", "Product:" into any output field

Return ONLY a single JSON object, no markdown:
{{
  "event": "the correct event or occasion — use the user's stated event if they mentioned one, otherwise keep '{event}'",
  "date": "date or timeframe mentioned, or null",
  "message": "their specific offer or key marketing message — rephrased into clean marketing language, no raw labels",
  "headline": "2–3 lines of polished marketing copy for the image. Transform the user's raw notes into clean, evocative ad copy. Rules: no hashtags, no asterisks, no markdown, no label prefixes (Offer:/Theme:), no placeholder text. The headline must reflect the actual occasion and offer — do NOT use the occasion name generically as the first line if it is just a theme or vague goal. Each line 3-7 words, grammatically correct, naturally phrased. Example: 'Buy One, Get One Free\\nIndulge in the Purest Aromas\\nThis Weekend Only'.",
  "products": "products or services to feature, or null",
  "visual_notes": "visual direction blending event mood with user preferences",
  "notes": "rich 3–4 sentence creative brief for the content generator, weaving together cultural themes, visual motifs, and business-specific details",
  "context": {{
    "themes": {themes},
    "mood": "{mood}",
    "visual_elements": {visual_elements},
    "color_suggestions": "{color_suggestions}",
    "content_angles": {content_angles},
    "cultural_context": "{cultural_context}"
  }},
  "gathered": true
}}"""

_CHANNELS_PARSE_PROMPT = """Identify which publishing platform(s) the user wants to use.

USER REPLY: "{reply}"

Return ONLY JSON, no markdown:
{{"channels": ["instagram"] | ["email"] | ["instagram", "email"]}}

Default to ["instagram"] if the reply is ambiguous or unclear."""

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


# ── Helper functions ───────────────────────────────────────────────────────────

def _format_history(history: list[dict], max_turns: int = 4) -> str:
    if not history:
        return "(no prior conversation)"
    recent = history[-(max_turns * 2):]
    lines = []
    for msg in recent:
        role = "User" if msg.get("role") == "user" else "Assistant"
        lines.append(f"[{role}]: {msg['content']}")
    return "\n".join(lines)


def _precheck_has_offer_detail(user_message: str) -> bool:
    """Return True if the user's message already contains a specific offer or campaign message."""
    prompt = (
        f'User message: "{user_message}"\n'
        f'Does this contain a specific marketing offer, deal, or key message '
        f'(e.g. "25% off", "free gift", "holiday wishes only", "buy one get one", '
        f'"exclusive launch", "20% discount")?\n'
        f'Return ONLY JSON: {{"has_detail": true|false}}'
    )
    result = _call_json(prompt, temperature=0.0)
    return bool(result.get("has_detail", False))


def _is_relevant_gather_reply(question: str, reply: str) -> bool:
    """Return True if the user's reply actually answers the campaign details question."""
    prompt = (
        f'You asked a business owner: "{question}"\n'
        f'They replied: "{reply}"\n\n'
        f'Is this reply genuinely answering the question about their campaign '
        f'(their offer, discount, product, message, or visual preference), '
        f'or is it a greeting / one-word acknowledgment / unrelated response?\n'
        f'Return ONLY JSON: {{"is_relevant": true|false}}'
    )
    result = _call_json(prompt, temperature=0.0)
    return bool(result.get("is_relevant", True))


def _call_json(prompt: str, temperature: float = 0.1) -> dict:
    response = _client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", temperature=temperature
        ),
    )
    result = json.loads(response.text)
    if isinstance(result, list):
        result = result[0] if result else {}
    return result


def _extract_intent(user_context, user_input: str, history: list[dict] | None = None) -> dict:
    logger.info(f"[SUPERVISOR ▶] Extracting intent ({_MODEL})")
    prompt = _INTENT_PROMPT.format(
        business_name=user_context.business_name or "Unknown",
        industry=user_context.industry or "Unknown",
        description=user_context.description or "",
        user_input=user_input,
        history=_format_history(history or []),
    )
    result = _call_json(prompt)
    logger.info(f"[SUPERVISOR ▶] Intent: category={result.get('category')}, "
                f"mode={result.get('mode')!r}, channels={result.get('channels')}, "
                f"follow_up={result.get('follow_up_needed')}")
    return result


def _enrich_event(event: str, user_context) -> dict:
    logger.info(f"[SUPERVISOR ▶] Enriching event: {event!r}")
    prompt = _EVENT_ENRICH_PROMPT.format(
        event=event,
        business_name=user_context.business_name or "the business",
        industry=user_context.industry or "general",
    )
    result = _call_json(prompt, temperature=0.3)
    logger.info(f"[SUPERVISOR ▶] Event enriched — themes: {result.get('themes', [])}, "
                f"mood: {result.get('mood', '')!r}")
    return result


def _generate_gather_question(event: str, enrichment: dict, user_context, history: list[dict] | None = None) -> str:
    logger.info(f"[SUPERVISOR ▶] Generating gather question for {event!r}")
    prompt = _OCCASION_GATHER_PROMPT.format(
        business_name=user_context.business_name or "your business",
        industry=user_context.industry or "your industry",
        event=event,
        themes=", ".join(enrichment.get("themes", [])) or "festive themes",
        typical_offers=", ".join(enrichment.get("typical_offers", [])) or "seasonal offers",
        mood=enrichment.get("mood", "celebratory"),
        history=_format_history(history or [], max_turns=2),
    )
    response = _client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.5),
    )
    return response.text.strip()


def build_context_summary(state: GraphState) -> str:
    """Readable session summary used by context-aware Q&A in supervisor and human_review."""
    parts = []

    mode = state.get("mode", "")
    channels = state.get("channels", [])
    if mode and mode != "unknown":
        parts.append(f"Campaign mode: {mode} for {', '.join(channels)} channel(s).")

    trend = state.get("selected_trend", {})
    if trend and trend.get("title"):
        parts.append(f"Selected trend: '{trend['title']}'.")
        if trend.get("description"):
            parts.append(f"Trend context: {trend['description']}")
        if trend.get("brand_angle"):
            parts.append(f"Brand angle: {trend['brand_angle']}")
        if trend.get("visual_direction"):
            parts.append(f"Visual direction used for images: {trend['visual_direction']}")
        if trend.get("headline"):
            parts.append(f"Campaign headline on images: {trend['headline']}")

    brief = state.get("occasion_brief", {})
    if brief and brief.get("event"):
        parts.append(f"Occasion: {brief['event']}.")
        if brief.get("message"):
            parts.append(f"Key offer/message: {brief['message']}")
        if brief.get("notes"):
            parts.append(f"Creative brief: {brief['notes']}")

    images = state.get("generated_images", [])
    if images:
        parts.append(f"{len(images)} marketing images generated and displayed.")

    captions = state.get("generated_captions", [])
    if captions:
        previews = []
        for i, c in enumerate(captions[:3]):
            text = c.replace("\n", " ")[:120]
            previews.append(f"#{i + 1}: \"{text}{'...' if len(c) > 120 else ''}\"")
        parts.append("Captions: " + " | ".join(previews))

    emails = state.get("generated_emails", [])
    if emails:
        subjects = [e.get("subject", "") for e in emails[:3] if isinstance(e, dict)]
        parts.append(f"Email subjects: {', '.join(subjects)}")

    approval = state.get("approval_result", {})
    if approval:
        status = "passed" if approval.get("passed") else "initially failed but was force-passed after max retries"
        score = approval.get("score", "N/A")
        parts.append(f"Quality check: {status} (score {score}). {approval.get('notes', '')}")
        per_item = approval.get("per_item", [])
        issues = [i for item in per_item for i in item.get("issues", [])[:2]]
        if issues:
            parts.append(f"Issues the approval agent flagged: {'; '.join(issues[:4])}")

    return "\n".join(parts) if parts else "No content has been generated yet in this session."


def answer_context_question(question: str, state: GraphState, business_name: str = "") -> str:
    """Generate a context-aware answer about the current session. Importable by human_review."""
    summary = build_context_summary(state)
    prompt = _CONTEXT_QA_PROMPT.format(
        business_name=business_name or "the business",
        context_summary=summary,
        user_question=question,
    )
    response = _client.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.4),
    )
    return response.text.strip()


# ── Nodes ──────────────────────────────────────────────────────────────────────

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
        result = _call_json(prompt)
        logger.info(f"[SUPERVISOR ▶] Refine flags: image={result.get('regenerate_image')}, "
                    f"caption={result.get('regenerate_caption')}, email={result.get('regenerate_email')}")
        return {
            "regenerate_image": result.get("regenerate_image", True),
            "regenerate_caption": result.get("regenerate_caption", True),
            "regenerate_email": result.get("regenerate_email", True),
            # refine_instruction stays in state — content_generator uses and clears it
        }

    # ── Intent extraction (no interrupts — supervisor_clarify handles the back-and-forth) ──
    user_input = state["user_input"]
    clarify_round = state.get("clarify_round", 0)
    history = list(state.get("conversation_history") or [])
    logger.info(f"[SUPERVISOR ▶] User input: {user_input!r} (clarify_round={clarify_round})")

    result = _extract_intent(user_context, user_input, history)

    category = result.get("category", "unknown")
    mode = result.get("mode") or "unknown"
    channels = result.get("channels") or ["unknown"]
    is_chat = category == "chat"
    is_off_topic = category == "off_topic"
    is_context_query = category == "context_query"
    follow_up_needed = result.get("follow_up_needed", False) and category == "content" and mode == "unknown"

    logger.info(f"[SUPERVISOR ▶] Category: {category!r}, mode={mode!r}, channels={channels}")

    # Context query — answer from session state, then route back through clarify (same as chat)
    if is_context_query:
        logger.info("[SUPERVISOR ▶] Context query — generating answer from session state")
        answer = answer_context_question(user_input, state, user_context.business_name or "")
        logger.info(f"[SUPERVISOR ▶] Context answer: {answer[:80]!r}")
        new_history = history + [
            {"role": "user", "content": user_input},
            {"role": "assistant", "content": answer},
        ]
        logger.info("[SUPERVISOR ▶] Node complete")
        return {
            "user_input": user_input,
            "mode": state.get("mode") or "unknown",
            "channels": state.get("channels") or ["unknown"],
            "is_chat": True,
            "chat_response": answer,
            "is_off_topic": False,
            "follow_up_needed": False,
            "follow_up_question": None,
            "redirect_message": None,
            "conversation_history": new_history[-12:],
        }

    # After 3 clarify rounds, stop the loop regardless of what the model says
    if clarify_round >= 3 and not is_chat:
        logger.warning("[SUPERVISOR ▶] Max clarify rounds reached — forcing trend mode")
        mode = "trend"
        is_chat = False
        is_off_topic = False
        follow_up_needed = False
        channels = channels if channels != ["unknown"] else ["instagram"]

    logger.info(f"[SUPERVISOR ▶] Result: mode={mode!r}, is_chat={is_chat}, "
                f"off_topic={is_off_topic}, follow_up={follow_up_needed}")
    logger.info("[SUPERVISOR ▶] Node complete")
    return {
        "user_input": user_input,
        "mode": mode,
        "channels": channels,
        "occasion_brief": result.get("occasion_brief") or {},
        "is_chat": is_chat,
        "chat_response": result.get("chat_response"),
        "is_off_topic": is_off_topic,
        "follow_up_needed": follow_up_needed,
        "follow_up_question": result.get("follow_up_question"),
        "redirect_message": result.get("redirect_message"),
    }


def supervisor_clarify_node(state: GraphState) -> dict:
    """Fires exactly ONE interrupt — chat reply, off-topic redirect, or follow-up question.
    After resume, resets state so supervisor re-classifies the new input."""
    logger.info("=" * 60)
    logger.info("[SUPERVISOR CLARIFY ▶] Node started")

    is_chat = state.get("is_chat", False)
    is_off_topic = state.get("is_off_topic", False)
    user_input = state.get("user_input", "")
    user_context = state["user_context"]
    clarify_round = state.get("clarify_round", 0)
    history = list(state.get("conversation_history") or [])

    if is_chat:
        response = state.get("chat_response") or (
            f"Hi! I'm here to help {user_context.business_name or 'your business'} create "
            "amazing social media content. What would you like to create today?"
        )
        logger.info(f"[SUPERVISOR CLARIFY ▶] Chat response (round {clarify_round + 1}): {response[:80]!r}")
        reply = interrupt({"type": "follow_up", "question": response})
        new_input = str(reply)

    elif is_off_topic:
        redirect = state.get("redirect_message") or (
            f"I don't have information on that. I can only help with content creation "
            f"for {user_context.business_name or 'your business'} — Instagram posts, email campaigns, and more. "
            "What would you like to create today?"
        )
        logger.info(f"[SUPERVISOR CLARIFY ▶] Off-topic redirect (round {clarify_round + 1})")
        reply = interrupt({"type": "follow_up", "question": redirect})
        new_input = str(reply)

    else:
        question = state.get("follow_up_question") or (
            "What would you like to create — content around a current trend, "
            "or for a specific event or occasion?"
        )
        logger.info(f"[SUPERVISOR CLARIFY ▶] Follow-up (round {clarify_round + 1}): {question!r}")
        reply = interrupt({"type": "follow_up", "question": question})
        new_input = f"{user_input}\n\nUser clarification: {reply}"

    reply_str = str(reply)
    logger.info(f"[SUPERVISOR CLARIFY ▶] Got reply: {reply_str[:80]!r}")

    # Record this turn in conversation history
    ai_msg = response if is_chat else (redirect if is_off_topic else question)
    new_history = history + [
        {"role": "assistant", "content": ai_msg},
        {"role": "user", "content": reply_str},
    ]

    logger.info("[SUPERVISOR CLARIFY ▶] Node complete")
    return {
        "user_input": new_input,
        "mode": "unknown",
        "is_chat": False,
        "chat_response": None,
        "is_off_topic": False,
        "follow_up_needed": False,
        "follow_up_question": None,
        "redirect_message": None,
        "clarify_round": clarify_round + 1,
        "conversation_history": new_history[-12:],
    }


def occasion_gather_node(state: GraphState) -> dict:
    logger.info("=" * 60)
    logger.info("[OCCASION GATHER ▶] Node started")

    existing_brief = state.get("occasion_brief", {})
    if existing_brief.get("gathered"):
        logger.info("[OCCASION GATHER ▶] Brief already gathered — skipping (graph replay)")
        return {}

    user_context = state["user_context"]
    event = existing_brief.get("event", "the occasion")
    user_input = state.get("user_input", "")
    history = list(state.get("conversation_history") or [])

    # Step 1: Enrich event with LLM knowledge
    enrichment = _enrich_event(event, user_context)

    # Step 2: Pre-check — does the user's original message already have offer/campaign details?
    if _precheck_has_offer_detail(user_input):
        logger.info("[OCCASION GATHER ▶] Initial message has offer detail — skipping interrupt")
        user_answers = user_input
    else:
        # Generate a dynamic gather question and ask
        question = _generate_gather_question(event, enrichment, user_context, history)
        logger.info(f"[OCCASION GATHER ▶] Asking user: {question[:120]!r}")

        first_reply = str(interrupt({"type": "follow_up", "question": question}))
        logger.info(f"[OCCASION GATHER ▶] First reply: {first_reply[:120]!r}")

        # Validate — if reply is a greeting or non-answer, re-ask once
        if not _is_relevant_gather_reply(question, first_reply):
            logger.info(f"[OCCASION GATHER ▶] Reply is not relevant — re-asking")
            reask = (
                "To create the best content for you, could you share what offer or message "
                "you'd like to highlight? For example, a discount, a product you want to feature, "
                "or the key theme for this campaign?"
            )
            user_answers = str(interrupt({"type": "follow_up", "question": reask}))
            logger.info(f"[OCCASION GATHER ▶] Second reply: {user_answers[:120]!r}")
            history = history + [
                {"role": "assistant", "content": question},
                {"role": "user", "content": first_reply},
                {"role": "assistant", "content": reask},
                {"role": "user", "content": user_answers},
            ]
        else:
            user_answers = first_reply
            history = history + [
                {"role": "assistant", "content": question},
                {"role": "user", "content": user_answers},
            ]

    logger.info(f"[OCCASION GATHER ▶] User answers: {str(user_answers)[:120]!r}")

    # Step 3: Quick-parse to detect if user stated a different event than the original
    # (e.g. original was "New Beginnings" but user replied "christmas")
    user_event_prompt = (
        f'From this user reply: "{user_answers}"\n'
        f'The original occasion was "{event}".\n'
        f'If the user mentioned a specific different event or holiday by name, extract it. '
        f'Otherwise return null.\n'
        f'Return ONLY JSON: {{"corrected_event": "event name or null"}}'
    )
    correction = _call_json(user_event_prompt)
    corrected_event = correction.get("corrected_event")
    if corrected_event and corrected_event.lower() != event.lower():
        logger.info(f"[OCCASION GATHER ▶] User corrected event: {event!r} → {corrected_event!r} — re-enriching")
        event = corrected_event
        enrichment = _enrich_event(event, user_context)

    # Step 4: Parse user answers + merge with enrichment into full brief
    prompt = _OCCASION_PARSE_PROMPT.format(
        business_name=user_context.business_name or "the business",
        industry=user_context.industry or "general",
        event=event,
        themes=json.dumps(enrichment.get("themes", [])),
        mood=enrichment.get("mood", ""),
        visual_elements=json.dumps(enrichment.get("visual_elements", [])),
        color_suggestions=enrichment.get("color_suggestions", ""),
        content_angles=json.dumps(enrichment.get("content_angles", [])),
        cultural_context=enrichment.get("cultural_context", ""),
        user_answers=user_answers,
    )
    brief = _call_json(prompt, temperature=0.2)
    brief["gathered"] = True

    logger.info(f"[OCCASION GATHER ▶] Brief ready: event={brief.get('event')!r}, "
                f"themes={brief.get('context', {}).get('themes', [])}")
    logger.info("[OCCASION GATHER ▶] Node complete")
    return {"occasion_brief": brief, "conversation_history": history[-12:]}


def channels_clarify_node(state: GraphState) -> dict:
    logger.info("=" * 60)
    logger.info(f"[CHANNELS ▶] Node started — mode={state.get('mode')!r}, clarifying channels")

    reply = interrupt({
        "type": "follow_up",
        "question": "Where would you like to post this content — Instagram, email, or both?",
    })

    logger.info(f"[CHANNELS ▶] User replied: {reply!r}")

    prompt = _CHANNELS_PARSE_PROMPT.format(reply=reply or "")
    result = _call_json(prompt)
    channels = result.get("channels", ["instagram"])
    if not isinstance(channels, list) or not channels:
        channels = ["instagram"]

    logger.info(f"[CHANNELS ▶] Resolved channels: {channels}")
    return {"channels": channels}


# ── Product clarify ────────────────────────────────────────────────────────────

_PRODUCT_SELECT_PROMPT = """The user wants to create a campaign. They have {count} products in their catalog.
Determine which products (if any) they want to feature based on their reply.

PRODUCTS:
{product_list}

USER REPLY: "{reply}"

Rules:
- If the user says no / skip / none / without product → return empty list
- If the user says yes / sure / all → return all product_ids (up to 3)
- If the user names specific products → match by name and return those product_ids
- Default (ambiguous yes) → return first 3 product_ids

Return ONLY valid JSON — no markdown:
{{"selected_ids": ["id1", "id2"]}}"""


def product_clarify_node(state: GraphState) -> dict:
    """Ask the user if they want to feature a product. Single interrupt."""
    ctx = state["user_context"]
    products = ctx.products

    logger.info("=" * 60)
    logger.info(f"[PRODUCT CLARIFY ▶] Node started — {len(products)} products available")

    product_lines = "\n".join(f"  {i+1}. {p.product_name}" for i, p in enumerate(products))
    question = (
        f"Would you like to feature a product in this campaign?\n\n"
        f"Your products:\n{product_lines}\n\n"
        f"Reply with 'yes' (I'll pick up to 3), name specific products, or 'no' to skip."
    )

    reply = interrupt({"type": "follow_up", "question": question})
    reply_text = str(reply).strip()
    logger.info(f"[PRODUCT CLARIFY ▶] Reply: {reply_text[:80]!r}")

    product_list_str = "\n".join(f"- id={p.product_id} name={p.product_name}" for p in products)
    prompt = _PRODUCT_SELECT_PROMPT.format(
        count=len(products),
        product_list=product_list_str,
        reply=reply_text,
    )
    result = _call_json(prompt, temperature=0.1)
    selected_ids = result.get("selected_ids", [])

    if not selected_ids:
        logger.info("[PRODUCT CLARIFY ▶] No product selected — normal flow")
        return {"use_product": False, "selected_products": []}

    selected_products = [
        p.model_dump() for p in products if p.product_id in selected_ids
    ][:3]
    logger.info(
        f"[PRODUCT CLARIFY ▶] Selected {len(selected_products)} products: "
        f"{[p['product_name'] for p in selected_products]}"
    )
    return {"use_product": True, "selected_products": selected_products}
