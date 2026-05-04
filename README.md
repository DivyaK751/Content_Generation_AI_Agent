# Brand Buddy
Multi-agent AI pipeline for Instagram and email marketing automation.

---

## Overview

BrandBuddy is an agentic AI platform that helps brands and businesses automate end-to-end social media and email content creation.

It combines trend discovery, AI-driven content generation, and automated publishing to help businesses consistently produce relevant, high-quality, and on-brand content.

The platform enables businesses to move seamlessly from idea → content → approval → publishing → performance tracking, with minimal manual effort.

---

## Live Demo

| Service | URL |
|---|---|
| Frontend | https://brandbuddy-frontend-510506868826.us-central1.run.app |

---

## Running Locally

### Backend

```bash
cd backend
pip install -r requirements.txt

export GOOGLE_OAUTH_CLIENT_SECRET_FILE=credentials/client_secret_<...>.json
export GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback
export JWT_SECRET_KEY=<random-string>
export GCP_PROJECT_ID=agentic-ai-dk3480
export BQ_DATASET_USERS=social_content_agent
export GCS_BUCKET_NAME=social-content-agent-assets
export FRONTEND_URL=http://localhost:3000
export OAUTHLIB_INSECURE_TRANSPORT=1   # dev only — allows HTTP OAuth

uvicorn main:app --reload
```

### Frontend (requires Node 18+)

```bash
cd frontend
npm install

export NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev   # http://localhost:3000
```

---

## Course Concepts

| Concept | Lecture | File(s) | Implementation |
|---|---|---|---|
| LangGraph StateGraph | Apr 06 | `backend/agents/graph.py` | The lecture introduced LangGraph as a harness for stateful agent loops. We implement this with `_build()`, which wires 12 nodes into a `StateGraph(GraphState)`. Each `*_node()` function is one turn of the loop — it reads from shared state and writes back only its own slice. `MemorySaver` persists the graph across HTTP requests using `thread_id`, so a campaign session survives multiple round-trips. |
| Router / Orchestrator | Mar 23 | `backend/agents/supervisor.py` | The lecture defined the Router/Orchestrator pattern as one agent owning all routing decisions. `supervisor_node` is that agent — it sends every user message to Gemini in JSON mode and classifies it into 5 intent categories. `route_after_supervisor()` reads the result and dispatches to `trend_fetch`, `occasion_gather`, `channels_clarify`, or directly to `content_generator`. No other agent makes routing decisions. |
| Generator-Critic | Mar 23 | `backend/agents/content_generator.py`, `backend/agents/approval.py` | The lecture described the Generator-Critic loop as a generator producing output and a critic providing structured feedback to retry. `content_generator_node` is the Generator — it produces 3 images, 3 captions, and 3 emails. `approval_node` is the Critic — it scores each item against a weighted rubric with hard failures (missing logo, missing brand name, or typos auto-fail). Failed items return a `fix_instruction` string back to the generator for up to 5 retry iterations. |
| Human-in-the-Loop | Mar 23 | `backend/agents/human_review.py` | The lecture covered keeping humans in control of consequential decisions without restarting the pipeline. We implement this with LangGraph's `interrupt()`, which pauses the graph at 3 explicit checkpoints — supervisor clarification, content review, and mid-session Q&A. State is surfaced to the frontend, and the user's response resumes the graph via `Command(resume=...)` posted to `/campaign/reply`. |
| Context Engineering | Feb 02 | `backend/agents/supervisor.py`, `backend/agents/content_generator.py` | The lecture emphasized injecting stable context as a fixed prefix and enforcing structured output. Every agent builds prompts with f-string templates that inject brand context (business name, industry, tone, brand colors) as a fixed prefix so prompts are consistent across turns. JSON-mode output (`response_mime_type="application/json"`) enforces structured responses, and escape-hatch instructions like `"do NOT render markdown as image text"` prevent instruction bleed into generated visuals. |
| Model-as-a-Judge | Feb 09 | `backend/agents/approval.py` | The lecture introduced using an LLM as an automated evaluator with a rubric. `approval_node` uses Gemini 2.5 Pro as the judge — it evaluates images via Vision and captions/emails via text. Hard failures (missing logo, typos) auto-fail regardless of score. Soft scores cover tone, relevance, and safety on a 0–100 scale, with a pass threshold of ≥ 60. Per-item `fix_instruction` is returned to guide the next generation round. |
| Context State Memory | Apr 13 | `backend/agents/state.py` | The lecture introduced the typed RunContext / scoped state pattern — a shared state object where each agent reads everything but writes only its own fields. `GraphState` is a TypedDict with 70+ optional fields spanning the full pipeline lifecycle (user context, mode, channels, generated content, approval results, iteration counts, refine flags). Each node receives the full snapshot and returns only the fields it modifies, keeping state accumulative and conflict-free. |
| Persistent Memory | Apr 13 | `backend/db/bigquery.py`, `backend/db/usage.py` | The lecture covered two-layer memory: a fast in-process cache backed by durable persistent storage. BigQuery is the durable layer — storing users, campaigns, products, and quota usage across sessions so context survives server restarts. `usage.py` adds an in-process `_usage_cache` dict for fast reads, backed by BigQuery for durable writes on cache miss — directly implementing the file-based persistent memory pattern from lecture. |
| Agents as Functions | Apr 20 | `backend/routers/campaign.py` | The lecture framed agents as pure functions that can be composed and exposed over HTTP. Every agent in the graph is a pure Python `(state) → dict` function with no side effects on the graph itself. `campaign.py` wraps the LangGraph pipeline as standard FastAPI endpoints (`/campaign/start`, `/campaign/reply`, `/campaign/publish`), turning the full agentic pipeline into a callable HTTP API. `MemorySaver` keyed by `thread_id` lets a session survive across multiple requests without re-running earlier steps. |
| Splitter + Researcher + Synthesizer | Apr 20 | `backend/agents/trend_analyzer.py` | The lecture described a parallel research pipeline pattern: split the task, research in parallel, then synthesize. `trend_fetch_node` is the Splitter + Researcher step — it uses Gemini 2.5 Pro with Google Search grounding to discover 6 trending topics (local, industry, viral, cross-industry mix) in a single LLM call. `trend_select_node` is the Synthesizer — it takes the user's chosen trend and translates it into `brand_angle`, `headline`, and `visual_direction`. |
| Tool Calling | Feb 16 | `backend/agents/publisher.py` | The lecture described the tool call / tool response loop where the LLM delegates actions to external systems and parses their responses. `publisher_node` treats Meta Graph API and SendGrid as external tool servers — it calls them with structured JSON payloads, polls Instagram's container status asynchronously until `FINISHED`, then parses tool responses (`post_id`, `X-Message-Id`). The pattern is identical to the tool use loop from lecture, with the APIs acting as tool servers. |
| Effort-Tiered Model Selection | Apr 27 | `backend/agents/content_generator.py` | The lecture introduced the Reasoning Models / Tunable Effort principle — match model capability to task complexity to control cost and latency. We implement three tiers: `gemini-2.5-flash-lite` for fast, low-stakes intent classification; `gemini-2.5-flash` for image editing; and `gemini-2.5-pro` for high-quality content generation and rubric evaluation. Harder, higher-stakes tasks get the more capable model. |

---

## Agent Architecture

### What each agent does

| Agent | File | What it does |
|---|---|---|
| **Supervisor** | `backend/agents/supervisor.py` | The entry point for every campaign. Reads the user's message and decides what kind of request it is — trend-based post, occasion-based post, or a clarifying question. Asks follow-ups if anything is unclear before passing control to the right agent. |
| **Trend Analyzer** | `backend/agents/trend_analyzer.py` | Uses Gemini + live Google Search to find 6 trending topics relevant to the business. Presents them to the user, waits for a pick, then translates the chosen trend into a creative direction (headline, visual style, brand angle). |
| **Content Generator** | `backend/agents/content_generator.py` | The creative engine. Takes the brand kit and the chosen trend or occasion and produces 3 Instagram images (via Imagen 4.0), 3 captions, and 3 email drafts. If the approval agent rejects any item, it regenerates only the flagged ones using the feedback provided. |
| **Approval** | `backend/agents/approval.py` | Automatically grades every piece of content before the user sees it. Uses Gemini 2.5 Pro as a judge — hard fails anything missing the logo or brand name, then scores tone, relevance, and safety. Failed content goes back to the generator with specific fix instructions (up to 5 retries). |
| **Human Review** | `backend/agents/human_review.py` | Pauses the pipeline and hands control to the user. The user picks their preferred image, caption, and email, or asks for a refinement. Also handles inline questions (e.g. "make the caption shorter") without restarting the whole pipeline. |
| **Publisher** | `backend/agents/publisher.py` | Takes the user's selected content and posts it. Uploads the image to Instagram via the Meta Graph API, waits for it to finish processing, then publishes it. Sends the email via SendGrid. Saves the campaign record to BigQuery. |

### Flow diagram

```mermaid
%%{init: {'theme': 'default'}}%%
flowchart TD
    START([Start]) --> supervisor

    supervisor -->|chat / off-topic / follow-up| supervisor_clarify:::interrupt
    supervisor_clarify:::interrupt -->|re-classify| supervisor

    supervisor -->|mode = occasion| occasion_gather:::interrupt
    occasion_gather:::interrupt -->|channels unknown| channels_clarify:::interrupt
    occasion_gather:::interrupt -->|has products| product_clarify:::interrupt
    occasion_gather:::interrupt -->|ready| content_generator

    supervisor -->|channels unknown| channels_clarify:::interrupt
    channels_clarify:::interrupt -->|mode = trend| trend_fetch
    channels_clarify:::interrupt -->|has products| product_clarify:::interrupt
    channels_clarify:::interrupt -->|ready| content_generator

    supervisor -->|mode = trend| trend_fetch
    trend_fetch --> trend_select:::interrupt
    trend_select:::interrupt -->|fetch more| trend_fetch
    trend_select:::interrupt -->|has products| product_clarify:::interrupt
    trend_select:::interrupt -->|ready| content_generator

    product_clarify:::interrupt --> content_generator
    supervisor -->|refine path| content_generator

    content_generator --> approval
    approval -->|failed & iter < 5| content_generator
    approval -->|passed or iter ≥ 5| human_review:::interrupt

    human_review:::interrupt -->|chat question| human_review_chat:::interrupt
    human_review_chat:::interrupt --> human_review:::interrupt
    human_review:::interrupt -->|refine instruction| supervisor
    human_review:::interrupt -->|publish| publisher

    publisher --> END([End])

    classDef interrupt stroke:#f90,stroke-width:2px,stroke-dasharray:5 5
```

Nodes with dashed orange borders pause the pipeline and surface state to the frontend. The user resumes by POSTing to `/campaign/reply`.
