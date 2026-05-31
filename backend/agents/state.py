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

    # Supervisor clarify loop
    clarify_round: int          # incremented each time supervisor_clarify fires
    is_off_topic: bool
    follow_up_needed: bool
    follow_up_question: Optional[str]
    redirect_message: Optional[str]

    # Image edit mode — URL of image selected for user refine (None = edit all)
    selected_image_for_refine: Optional[str]

    # skip_approval removed — all images always go through approval now

    # Chatbot layer — greeting / small-talk response generated inline by supervisor
    is_chat: bool
    chat_response: Optional[str]

    # Set by content_generator so approval can run a focused check
    # last_refine_instruction: the user's refine text (empty = approval-retry path)
    # last_edited_image_index: index in generated_images that was edited (None = all)
    last_refine_instruction: str
    last_edited_image_index: Optional[int]

    # Human review chat loop — set by human_review_node, answered by human_review_chat_node
    chat_question: Optional[str]

    # Product featuring (set by product_clarify_node)
    use_product: Optional[bool]      # None = not asked yet, True/False = user answered
    selected_products: list          # list of Product dicts (up to 3)

    # Conversation history for context-aware intent classification
    conversation_history: list[dict]  # [{"role": "user"|"assistant", "content": "..."}]
