import logging

from langgraph.types import interrupt

from agents.state import GraphState

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
        "channels": [...]
    }

    Resume payload expected from frontend (one of):
      Action = publish:
        {"action": "publish", "selected": {"image_url": "...", "caption": "...", "email": {"subject": "...", "body": "..."}}}
      Action = refine:
        {"action": "refine", "instruction": "make the image brighter", "regenerate_image": true, "regenerate_caption": false, "regenerate_email": false}
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

    selection = interrupt({
        "type": "human_review",
        "generated_images": images,
        "generated_captions": captions,
        "generated_emails": emails,
        "approval_result": approval,
        "iteration_count": iteration,
        "channels": channels,
    })

    logger.info(f"[HUMAN REVIEW ▶] Resumed — action: {selection.get('action') if isinstance(selection, dict) else type(selection).__name__!r}")

    if not isinstance(selection, dict):
        logger.warning(f"[HUMAN REVIEW ▶] Unexpected resume type {type(selection)} — defaulting to first items")
        return {
            "selected": _default_selection(images, captions, emails),
            "refine_instruction": "",
            "regenerate_image": False,
            "regenerate_caption": False,
            "regenerate_email": False,
        }

    action = selection.get("action", "publish")

    if action == "refine":
        instruction = selection.get("instruction", "").strip()
        regen_image = bool(selection.get("regenerate_image", True))
        regen_caption = bool(selection.get("regenerate_caption", True))
        regen_email = bool(selection.get("regenerate_email", True))

        # If no specific flags set, default to regenerating everything
        if not any([regen_image, regen_caption, regen_email]):
            regen_image = regen_caption = regen_email = True

        logger.info(
            f"Human Review: refine requested — '{instruction}' "
            f"(image={regen_image}, caption={regen_caption}, email={regen_email})"
        )
        return {
            "refine_instruction": instruction,
            "regenerate_image": regen_image,
            "regenerate_caption": regen_caption,
            "regenerate_email": regen_email,
            "selected": {},
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
    }


def _default_selection(images: list, captions: list, emails: list) -> dict:
    return {
        "image_url": images[0] if images else None,
        "caption": captions[0] if captions else None,
        "email": emails[0] if emails else None,
    }
