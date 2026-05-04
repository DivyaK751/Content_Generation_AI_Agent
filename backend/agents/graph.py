import logging
from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver

from agents.state import GraphState
from agents.supervisor import supervisor_node, supervisor_clarify_node, channels_clarify_node, occasion_gather_node, product_clarify_node
from agents.trend_analyzer import trend_fetch_node, trend_select_node
from agents.content_generator import content_generator_node
from agents.approval import approval_node
from agents.human_review import human_review_node, human_review_chat_node
from agents.publisher import publisher_node

logger = logging.getLogger(__name__)


# ── Routing helpers ───────────────────────────────────────────────────────────

def _needs_product_clarify(state: GraphState) -> bool:
    channels = state.get("channels", [])
    mode = state.get("mode", "")
    products = state["user_context"].products
    result = (
        "instagram" in channels
        and mode in ("trend", "occasion")
        and len(products) > 0
        and state.get("use_product") is None
    )
    logger.info(
        f"[PRODUCT CHECK] channels={channels}, mode={mode!r}, "
        f"products_count={len(products)}, use_product={state.get('use_product')} → {result}"
    )
    return result


# ── Routing functions ──────────────────────────────────────────────────────────

def route_after_supervisor(state: GraphState) -> str:
    # Refine path
    if state.get("regenerate_image") or state.get("regenerate_caption") or state.get("regenerate_email"):
        return "content_generator"
    # Chat / off-topic / unclear intent → one interrupt per clarify node visit
    if state.get("is_chat") or state.get("is_off_topic") or state.get("follow_up_needed"):
        return "supervisor_clarify"
    mode = state.get("mode", "")
    # Occasion: gather event details first — channels question comes after if still unknown
    if mode == "occasion":
        return "occasion_gather"
    # Channels not yet determined — ask before going further
    channels = state.get("channels", [])
    if not channels or channels == ["unknown"]:
        return "channels_clarify"
    if mode == "trend":
        return "trend_fetch"
    return "content_generator"


def route_after_occasion_gather(state: GraphState) -> str:
    channels = state.get("channels", [])
    if not channels or channels == ["unknown"]:
        return "channels_clarify"
    if _needs_product_clarify(state):
        return "product_clarify"
    return "content_generator"


def route_after_channels_clarify(state: GraphState) -> str:
    mode = state.get("mode", "")
    if mode == "trend":
        return "trend_fetch"
    # For occasion mode, occasion_gather already ran before channels_clarify
    if _needs_product_clarify(state):
        return "product_clarify"
    return "content_generator"


def route_after_trend_select(state: GraphState) -> str:
    if state.get("fetch_more_trends"):
        logger.info("User wants more trends — looping back to fetch")
        return "trend_fetch"
    if _needs_product_clarify(state):
        return "product_clarify"
    return "content_generator"


def route_after_content_generator(state: GraphState) -> str:
    return "approval"


def route_after_approval(state: GraphState) -> str:
    result = state.get("approval_result", {})
    iter_count = state.get("iteration_count", 0)
    if not result.get("passed") and iter_count < 5:
        logger.info(f"Approval failed — retrying (iteration {iter_count})")
        return "content_generator"
    return "human_review"


def route_after_human_review(state: GraphState) -> str:
    if state.get("is_chat"):
        return "human_review_chat"
    if state.get("refine_instruction"):
        return "supervisor"
    return "publisher"


# ── Build and compile ──────────────────────────────────────────────────────────

def _build() -> StateGraph:
    builder = StateGraph(GraphState)

    builder.add_node("supervisor", supervisor_node)
    builder.add_node("supervisor_clarify", supervisor_clarify_node)
    builder.add_node("channels_clarify", channels_clarify_node)
    builder.add_node("occasion_gather", occasion_gather_node)
    builder.add_node("trend_fetch", trend_fetch_node)
    builder.add_node("trend_select", trend_select_node)
    builder.add_node("product_clarify", product_clarify_node)
    builder.add_node("content_generator", content_generator_node)
    builder.add_node("approval", approval_node)
    builder.add_node("human_review", human_review_node)
    builder.add_node("human_review_chat", human_review_chat_node)
    builder.add_node("publisher", publisher_node)

    builder.add_edge(START, "supervisor")

    builder.add_conditional_edges(
        "supervisor",
        route_after_supervisor,
        {
            "supervisor_clarify": "supervisor_clarify",
            "channels_clarify": "channels_clarify",
            "trend_fetch": "trend_fetch",
            "occasion_gather": "occasion_gather",
            "content_generator": "content_generator",
        },
    )

    # After clarifying, always go back to supervisor to re-classify
    builder.add_edge("supervisor_clarify", "supervisor")

    builder.add_conditional_edges(
        "channels_clarify",
        route_after_channels_clarify,
        {"trend_fetch": "trend_fetch", "occasion_gather": "occasion_gather", "product_clarify": "product_clarify", "content_generator": "content_generator"},
    )

    builder.add_conditional_edges(
        "occasion_gather",
        route_after_occasion_gather,
        {"channels_clarify": "channels_clarify", "product_clarify": "product_clarify", "content_generator": "content_generator"},
    )

    # trend_fetch always goes to trend_select
    builder.add_edge("trend_fetch", "trend_select")

    builder.add_conditional_edges(
        "trend_select",
        route_after_trend_select,
        {"trend_fetch": "trend_fetch", "product_clarify": "product_clarify", "content_generator": "content_generator"},
    )

    # product_clarify always flows directly to content_generator (all gathering is done)
    builder.add_edge("product_clarify", "content_generator")

    builder.add_conditional_edges(
        "content_generator",
        route_after_content_generator,
        {"approval": "approval", "human_review": "human_review"},
    )

    builder.add_conditional_edges(
        "approval",
        route_after_approval,
        {"content_generator": "content_generator", "human_review": "human_review"},
    )

    builder.add_conditional_edges(
        "human_review",
        route_after_human_review,
        {
            "human_review_chat": "human_review_chat",
            "supervisor": "supervisor",
            "publisher": "publisher",
        },
    )

    # After answering a chat question, loop back so the user sees the answer
    builder.add_edge("human_review_chat", "human_review")

    builder.add_edge("publisher", END)

    return builder.compile(checkpointer=MemorySaver())


graph = _build()
