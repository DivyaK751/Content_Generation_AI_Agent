from typing import TypedDict, Optional
from models.user import UserContext


class GraphState(TypedDict, total=False):
    # Set once at start, read-only throughout
    user_context: UserContext

    # User input (may grow with clarification appended)
    user_input: str

    # Supervisor outputs
    mode: Optional[str]       # "trend" | "occasion"
    channels: list[str]       # ["instagram"] | ["email"] | ["instagram", "email"]
    occasion_brief: dict

    # Trend analyzer outputs
    trend_options: list[dict]
    selected_trend: dict
    fetch_more_trends: bool   # True → graph loops back to trend_analyzer for a fresh fetch

    # Content generator outputs
    generated_images: list[str]    # GCS URLs
    generated_captions: list[str]
    generated_emails: list[dict]   # [{subject, body}]

    # Approval
    approval_result: dict   # {passed, notes, per_item}
    iteration_count: int    # max 5

    # Refine path flags (set by supervisor on refine)
    refine_instruction: str
    regenerate_image: bool
    regenerate_caption: bool
    regenerate_email: bool

    # Human review selection
    selected: dict   # {image_url, caption, email}

    # Publisher output
    publish_result: dict
