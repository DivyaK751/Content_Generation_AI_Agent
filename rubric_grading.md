# Capstone Rubric Grading — AI Marketing Campaign Agent

---

## 1. Uses an Agent Framework

**Status: Met**

The entire backend is built on **LangGraph**, a production-grade agent orchestration framework. The pipeline is a `StateGraph` with 10 named nodes wired together with conditional routing edges (`graph.py`):

| Node | Role |
|---|---|
| `supervisor` | Classifies intent, routes to the right pipeline |
| `supervisor_clarify` | Asks follow-up questions before proceeding |
| `channels_clarify` | Confirms which channels (Instagram, Email, or both) |
| `occasion_gather` | Enriches occasion-mode briefs with cultural context |
| `trend_fetch` | Fetches real-time trends via Google Search tool |
| `trend_select` | User picks a trend; LLM generates brand angle + visual direction |
| `content_generator` | Generates images (Gemini Flash / Imagen 4.0), captions, emails |
| `approval` | Gemini Vision quality-checks all generated content |
| `human_review` | Pauses for human approval, chat, or refine instruction |
| `publisher` | Posts to Instagram (Meta Graph API) and/or sends emails via SMTP |

LangGraph's `MemorySaver` checkpointer persists the full `GraphState` across HTTP requests, enabling multi-turn stateful sessions per user thread.

---

## 2. Deployed and Accessible via URL

**Status: Deferred — will be completed at submission**

The app is built for deployment:
- Backend: FastAPI with a clean `/campaign/start`, `/campaign/reply`, `/campaign/chat`, `/campaign/refine`, `/campaign/publish` REST API
- Frontend: Next.js (App Router)
- Infrastructure: Google Cloud (Vertex AI, GCS, BigQuery), Meta Graph API for Instagram

---

## 3. Original — Not a Refactor of Project 1 (Vizabot) or Project 2 (Data Analyst Agent)

**Status: Met**

| Dimension | Vizabot | Data Analyst Agent | This Project |
|---|---|---|---|
| Domain | Visual Q&A bot | Data querying & analysis | Marketing campaign generation |
| Output | Text answers about images | SQL queries, charts, summaries | Images, Instagram captions, emails |
| Agentic pattern | Single-agent retrieval | Single-agent tool use | Multi-agent pipeline with HITL |
| User interaction | Q&A | Q&A | Conversational campaign builder |
| External integrations | None | Database | Instagram API, SMTP, GCS, BigQuery |

This project introduces a new problem domain (brand marketing automation), a new architecture (multi-agent supervisor pattern with a human-in-the-loop review stage), new modalities (image generation and editing), and new external integrations (Meta Graph API, Gemini Flash Image, Imagen 4.0). It shares no code with either prior project.

---

## 4. Incorporates Three+ Concepts from Class

**Status: Met — six distinct concepts demonstrated**

### Concept 1 — Multi-Agent Orchestration with Supervisor Pattern
The `supervisor_node` acts as an LLM-powered router. It classifies every user message into one of five categories (`content`, `chat`, `off_topic`, `unknown`, `context_query`) and decides which downstream agent to invoke. Specialized agents (trend analyzer, content generator, approval, publisher) each handle a single responsibility. This is the supervisor-worker multi-agent architecture taught in class, implemented end-to-end.

**Where:** `agents/supervisor.py` → `agents/graph.py` (routing edges)

---

### Concept 2 — Human-in-the-Loop (HITL)
After content is generated and passes AI approval, the pipeline **pauses** using LangGraph's `interrupt()` primitive. The frontend receives the generated images, captions, and emails and presents them to the user. The user can:
- **Chat** — ask questions about the content (the agent answers and re-interrupts, keeping the panel open)
- **Refine** — request changes (loops back through content generation and approval)
- **Publish** — approve and send to Instagram/email

This is textbook HITL: the agent does not publish anything without explicit human sign-off.

**Where:** `agents/human_review.py` — `while True` loop with `interrupt()` / `Command(resume=...)`

---

### Concept 3 — Agentic Reflection Loop (Self-Critique and Retry)
The `approval_node` uses Gemini Vision to evaluate every generated image, caption set, and email batch against brand quality criteria (brand presence, typo check, theme relevance). If any item fails, the node sets `regenerate_image / regenerate_caption / regenerate_email = True` and the graph routes back to `content_generator`. The loop repeats up to 4 iterations, with a forced pass at iteration 5 to prevent infinite loops. This is the reflection/self-critique agentic loop pattern.

**Where:** `agents/approval.py` → `agents/graph.py` (`route_after_approval`)

---

### Concept 4 — Real-Time Tool Use with LLM Reasoning
`trend_fetch_node` uses Gemini 2.5 Pro with the **Google Search tool** enabled to find what is actually trending right now — not hallucinated topics from training data. The LLM is instructed to find local/regional trends, industry-specific trends, global viral trends, and cross-industry opportunities. After the user picks a trend, a second LLM call generates a `brand_angle` (marketing copy angle) and `visual_direction` (painterly scene description for the image model) — this is LLM planning/reasoning on top of retrieved real-world data.

**Where:** `agents/trend_analyzer.py` — `_fetch()` with `tools=[Tool(google_search=GoogleSearch())]`

---

### Concept 5 — Multimodal AI (Generation + Vision)
The system uses three distinct multimodal models:

- **Gemini Flash Image** (generation + editing): Given the brand logo as an input image plus a rich prompt, it generates branded Instagram images. In refine/retry mode, the existing image is passed back in as input and the model edits it in place rather than regenerating from scratch.
- **Imagen 4.0** (fallback generation): Used when Gemini is rate-limited or unavailable. A separate natural-language prompt avoids Imagen's limitation of rendering instruction labels as literal on-image text.
- **Gemini 2.5 Pro Vision** (evaluation): The approval agent downloads each generated image and uses Gemini Vision to check brand name/logo presence, typos, and theme relevance — a vision-based quality gate.

This covers multimodal input (image + text prompt) and multimodal output (image bytes), both taught as core LLM capabilities.

**Where:** `agents/content_generator.py` (`_gemini_flash_image`, `_imagen`, `_edit_image_with_gemini`), `agents/approval.py` (`_check_image`, `_check_image_refine`)

---

### Concept 6 — Stateful Conversational Agent with Context-Aware Q&A
The supervisor maintains a 5th intent category (`context_query`) that lets users ask questions about the current session at any time — even mid-review. A `build_context_summary(state)` function serializes the full `GraphState` (chosen trend, brand angle, visual direction, approval scores, generated content previews) into a readable summary. `answer_context_question()` passes this summary to Gemini and returns a grounded answer. This implements the context-aware conversational agent pattern, where the agent's answers are grounded in actual session state rather than hallucinated.

**Where:** `agents/supervisor.py` (`build_context_summary`, `answer_context_question`), `agents/human_review.py` (`action == "chat"` branch)

---

## Summary

| Criterion | Status |
|---|---|
| Uses an agent framework | LangGraph — 10-node StateGraph with conditional routing |
| Deployed via URL | Deferred to submission |
| Original (not Vizabot or Data Analyst) | Different domain, architecture, modalities, integrations |
| Three+ class concepts | Six demonstrated: multi-agent orchestration, HITL, reflection loop, real-time tool use, multimodal AI, stateful context Q&A |
