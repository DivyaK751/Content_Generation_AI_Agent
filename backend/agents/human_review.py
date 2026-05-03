import logging

from langgraph.types import interrupt

from agents.state import GraphState
from agents.supervisor import answer_context_question

logger = logging.getLogger(__name__)


def human_review_node(state: GraphState) -> dict:
    """
    Pauses the pipeline so the user can review all generated content,
    pick their preferred image/caption/email, or send a refine instruction.

    Interrupt payload sent to frontend:
    {
        "type": "human_review",
        "generated_images": [...],
        "generated_captions": [...],
        "generated_emails": [...],
        "approval_result": {...},
        "iteration_count": int,
        "channels": [...],
        "chat_response": "..." (only present after a chat round-trip)
    }

    Resume payload expected from frontend (one of):
      Action = publish:
        {"action": "publish", "selected": {"image_url": "...", "caption": "...", "email": {"subject": "...", "body": "..."}}}
      Action = refine:
        {"action": "refine", "instruction": "make the image brighter", "regenerate_image": true, ...}
      Action = chat:
        {"action": "chat", "message": "why don't the images match the trend?"}
    """
    logger.info("=" * 60)
    logger.info("[HUMAN REVIEW ▶] Node started — pausing for user review")

    images = state.get("generated_images", [])
    captions = state.get("generated_captions", [])
    emails = state.get("generated_emails", [])
    approval = state.get("approval_result", {})
    channels = state.get("channels", [])
    iteration = state.get("iteration_count", 0)

    logger.info(f"[HUMAN REVIEW ▶] Content ready: {len(images)} images, "
                f"{len(captions)} captions, {len(emails)} emails")
    logger.info(f"[HUMAN REVIEW ▶] Approval: passed={approval.get('passed')}, score={approval.get('score')}")

    payload = {
        "type": "human_review",
        "generated_images": images,
        "generated_captions": captions,
        "generated_emails": emails,
        "approval_result": approval,
        "iteration_count": iteration,
        "channels": channels,
    }

    # Include answer from the previous chat round-trip (if any)
    prev_chat_response = state.get("chat_response")
    if prev_chat_response:
        payload["chat_response"] = prev_chat_response
        logger.info(f"[HUMAN REVIEW ▶] Including previous chat response in payload")

    selection = interrupt(payload)

    logger.info(f"[HUMAN REVIEW ▶] Resumed — action: {selection.get('action') if isinstance(selection, dict) else type(selection).__name__!r}")

    # Plain string received — /campaign/reply was called instead of /campaign/chat
    # Treat as a chat question rather than auto-publishing
    if not isinstance(selection, dict):
        if isinstance(selection, str) and selection.strip():
            logger.warning(f"[HUMAN REVIEW ▶] Plain string received — treating as chat: {selection[:80]!r}")
            return {
                "is_chat": True,
                "chat_question": selection.strip(),
                "chat_response": None,
            }
        logger.warning(f"[HUMAN REVIEW ▶] Unexpected resume type {type(selection)} — looping back safely")
        return {
            "is_chat": True,
            "chat_question": "",
            "chat_response": None,
        }

    action = selection.get("action", "publish")

    # Chat during review — route to human_review_chat_node, then back here
    if action == "chat":
        question = selection.get("message", "").strip()
        logger.info(f"[HUMAN REVIEW ▶] Chat question: {question[:80]!r}")
        return {
            "is_chat": True,
            "chat_question": question,
            "chat_response": None,
        }

    if action == "refine":
        instruction = selection.get("instruction", "").strip()
        regen_image = bool(selection.get("regenerate_image", True))
        regen_caption = bool(selection.get("regenerate_caption", True))
        regen_email = bool(selection.get("regenerate_email", True))

        if not any([regen_image, regen_caption, regen_email]):
            regen_image = regen_caption = regen_email = True

        logger.info(
            f"[HUMAN REVIEW ▶] Refine requested — '{instruction}' "
            f"(image={regen_image}, caption={regen_caption}, email={regen_email})"
        )
        return {
            "refine_instruction": instruction,
            "regenerate_image": regen_image,
            "regenerate_caption": regen_caption,
            "regenerate_email": regen_email,
            "selected_image_for_refine": selection.get("selected_image_url"),
            "selected": {},
            "is_chat": False,
            "chat_response": None,
            "chat_question": None,
        }

    # action == "publish"
    selected = selection.get("selected", {})
    if not selected:
        selected = _default_selection(images, captions, emails)

    logger.info(
        f"[HUMAN REVIEW ▶] User approved — "
        f"image={'yes' if selected.get('image_url') else 'no'}, "
        f"caption={'yes' if selected.get('caption') else 'no'}, "
        f"email={'yes' if selected.get('email') else 'no'}"
    )
    logger.info("[HUMAN REVIEW ▶] Node complete — routing to publisher")
    return {
        "selected": selected,
        "refine_instruction": "",
        "regenerate_image": False,
        "regenerate_caption": False,
        "regenerate_email": False,
        "is_chat": False,
        "chat_response": None,
        "chat_question": None,
    }


def human_review_chat_node(state: GraphState) -> dict:
    """
    Answers a chat question asked during human review, then routes back
    to human_review_node so the user can continue reviewing.
    Avoids calling interrupt() multiple times from the same node.
    """
    question = state.get("chat_question", "").strip()
    user_context = state["user_context"]

    logger.info(f"[HUMAN REVIEW CHAT ▶] Answering: {question[:80]!r}")

    if not question:
        chat_response = "I didn't catch that — could you rephrase your question?"
    else:
        chat_response = answer_context_question(
            question, state, user_context.business_name or ""
        )

    logger.info(f"[HUMAN REVIEW CHAT ▶] Answer: {chat_response[:80]!r}")
    return {
        "is_chat": False,
        "chat_response": chat_response,
        "chat_question": None,
    }


def _default_selection(images: list, captions: list, emails: list) -> dict:
    return {
        "image_url": images[0] if images else None,
        "caption": captions[0] if captions else None,
        "email": emails[0] if emails else None,
    }
