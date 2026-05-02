# Agentic AI Content Generator — Planning & Progress

## Project Overview
Multi-agent system that automates Instagram and email content creation for small businesses.
Built entirely on Google Cloud / Vertex AI (project: `agentic-ai-dk3480`, region: `us-central1`).

---

## Tech Stack
| Layer | Choice |
|---|---|
| Text AI | Gemini 2.5 Pro (Vertex AI) |
| Image AI | Imagen 4.0 (Vertex AI) |
| Agent Framework | LangGraph |
| Storage | BigQuery (user data) + GCS (images/logos) |
| Trend Detection | Gemini 2.5 Pro + Google Search Grounding |
| Instagram | Meta Graph API |
| Email | SendGrid |
| Backend | Python + FastAPI |
| Frontend | Next.js (React, App Router) |
| Deployment | Google Cloud Run |
| Auth | Firebase Auth / Google OAuth |

---

## Shared User Context

After login, the user's profile is fetched **once** from BigQuery (`users` table) and loaded into a `UserContext` object. This is kept in the FastAPI session for the entire campaign run and passed as **read-only** context to every agent — no agent makes its own DB call.

```python
UserContext {
  user_id, business_name, industry, location,
  brand_colors, logo_gcs_url, tagline, tone,
  target_audience, instagram_page_id,
  instagram_access_token, sendgrid_api_key
}
```

**How it flows:**
- Fetched once at `/auth/google` login → stored in session
- Passed to: Trend Analyzer → Content Generator → Approval Agent → Publisher Agent
- Never mutated by any agent — read-only throughout the pipeline
- On subsequent logins, profile is re-fetched from BigQuery (picks up any profile edits from onboarding)

**Why this matters:** Keeps agents stateless and simple — each agent receives `UserContext + its specific inputs` and returns its outputs. No agent needs to know about DB access.

---

## Development Phases

### Phase 1 — Project Setup & Infrastructure
- [ ] Create repo `social-content-agent/` with `backend/` and `frontend/` subdirs
- [ ] Backend: init with `uv`, copy `.venv` pattern from imagen-gen project
- [ ] Frontend: `npx create-next-app@latest frontend --typescript --app`
- [ ] Set up Google OAuth credentials in GCP Console
- [ ] Create BigQuery dataset: `social_content_agent`
- [ ] Create BigQuery tables: `users`, `campaigns`
- [ ] Create BigQuery dataset: `published_content`
- [ ] Create BigQuery table: `published_content.posts` (see Published Posts schema)
- [ ] Create GCS bucket: `social-content-agent-assets`

**Status:** Not started

---

### Phase 2 — FastAPI Skeleton + Auth + Onboarding
- [ ] `/auth/google` — OAuth login endpoint, writes new user to BigQuery
- [ ] `/onboarding` — POST endpoint, saves onboarding form to BigQuery `users` table
- [ ] `/campaign/start` — kicks off LangGraph pipeline, returns session/thread ID
- [ ] `/campaign/resume` — resumes graph after user selection at `human_review_node`
- [ ] `/campaign/status/{id}` — returns current pipeline state to frontend

**Onboarding form sections:**
- Section 1: Business basics (name, industry, description, location, website)
- Section 2: Brand identity (logo upload, colors, tagline, tone)
- Section 3: Target audience (customer description, age group, gender, interests)
- Section 4: Content preferences (content types, image style, language, avoid topics)
- Section 5: Instagram setup (handle, business account ID, page access token)
- Section 6: Email setup (sender name, sender email, email list CSV, SendGrid API key)

**Status:** Not started

---

### Phase 3 — LangGraph Graph Scaffold
- [ ] Define `UserContext` TypedDict
- [ ] Define graph with node stubs (log and pass through)
- [ ] Wire up conditional retry edge on `approval_node`
- [ ] Test graph runs end-to-end with stubs before filling real logic

**Graph flow:**
```
trend_analyzer_node → content_generator_node → approval_node
  ↓ (all fail, iter < 3) → back to content_generator_node
  ↓ (some pass OR iter >= 3) → human_review_node [interrupt()]
  → publisher_node → END
```

**Status:** Not started

---

### Phase 4 — Trend Analyzer Agent
- [ ] Mode A (Occasion/Event): user inputs event → Gemini fetches occasion background, themes, hashtags
- [ ] Mode B (Current Trends): uses location from profile → Gemini + Search Grounding fetches top 4–5 trends today
- [ ] Output: structured `trend_brief` → passed to Content Generator

**Status:** Not started

---

### Phase 5 — Content Generator Agent
- [ ] **Image sub-agent (Imagen 4.0):** build detailed prompt with logo placement, brand colors, occasion/trend, aspect ratio (1:1 or 4:5) → generate 3–4 options → save to GCS → return URLs
- [ ] **Email sub-agent (Gemini):** generate 3–4 subject line options + full email body copy
- [ ] **Tagline sub-agent (Gemini):** generate 3–4 Instagram caption options with hashtags

**Status:** Not started

---

### Phase 6 — Approval Agent
- [ ] Run vision checks on ALL generated images (Gemini 2.5 Pro Vision):
  - Logo presence
  - Logo size / not obscured
  - Text legibility
  - Brand color alignment
  - Image relevance to trend/occasion
  - No offensive content
- [ ] Pass approved subset to `human_review_node`
- [ ] If ALL fail and iter < 3: loop back to content generator with failure notes
- [ ] If ALL fail and iter >= 3: surface best available with warning

**Status:** Not started

---

### Phase 7 — Human Review Node (LangGraph interrupt)
- [ ] Implement `interrupt()` at `human_review_node`
- [ ] FastAPI returns approved image options + taglines + email options to Next.js
- [ ] User picks one of each in UI
- [ ] Next.js POSTs selections back → FastAPI resumes graph

**Status:** Not started

---

### Phase 8 — Publisher Agent
- [ ] **Instagram:** Meta Graph API → post image + caption to business Instagram account
- [ ] **Email:** SendGrid API → send to email list (CSV in GCS or BigQuery)
- [ ] Return: Instagram post URL + email delivery summary
- [ ] Write row(s) to `published_content.posts` — one row per channel (Instagram and/or Email), with image GCS URL or email body, tagline/subject, reach, platform post ID, campaign theme

**Status:** Not started

---

### Phase 9 — Next.js Frontend
- [ ] Login page (2 buttons: "Log In" / "Get Started")
- [ ] Onboarding multi-step form (6 sections)
- [ ] Dashboard: mode selection (Occasion vs Trends)
- [ ] Content review page: image carousel + tagline selector + email selector + Publish button
- [ ] Post-publish confirmation screen with Instagram URL + email summary

**Status:** Not started

---

### Phase 10 — Cloud Run Deployment
- [ ] Dockerize FastAPI backend
- [ ] Deploy backend to Cloud Run
- [ ] Deploy Next.js frontend to Cloud Run (or Vercel)
- [ ] Set environment variables and secrets (GCP Secret Manager)

**Status:** Not started

---

## Published Posts — BigQuery Storage

Every successful publish writes a row to a **separate BigQuery dataset** (`published_content`) dedicated to post history. This keeps it cleanly isolated from the user profile dataset (`social_content_agent`).

**Dataset:** `published_content`
**Table:** `posts`

**Schema:**

| Column | Type | Description |
|---|---|---|
| `post_id` | STRING | Unique ID for this publish event |
| `user_id` | STRING | FK → `social_content_agent.users.user_id` |
| `business_name` | STRING | Denormalised for easy querying |
| `channel` | STRING | `instagram` or `email` |
| `published_at` | TIMESTAMP | UTC datetime of publish |
| `content_url` | STRING | GCS URL of the image (Instagram) or `null` (Email) |
| `email_body` | STRING | Full email body text (Email) or `null` (Instagram) |
| `tagline` | STRING | Instagram caption OR email subject line |
| `hashtags` | STRING | Comma-separated hashtags (Instagram) or `null` |
| `reach` | INTEGER | Recipient count — Instagram followers or email list size |
| `platform_post_id` | STRING | Instagram post ID or SendGrid message ID |
| `campaign_theme` | STRING | Occasion name or trend title used to generate content |

**One row per channel per publish.** A campaign that publishes to both Instagram and Email writes two rows — same `published_at`, different `channel`.

**Why a separate dataset:**
- The `social_content_agent` dataset holds user profile data (PII, tokens). Keeping post history isolated makes it easier to scope access, run analytics queries, and potentially expose a read-only view to the frontend without touching the users table.

**Who writes it:** The `publisher_node` in the LangGraph pipeline writes the row(s) after a successful publish call (Meta Graph API or SendGrid). If publishing fails, no row is written.

---

## Agent Implementation Logic

### Graph State

```python
class GraphState(TypedDict):
    user_context: UserContext         # read-only, set once at start
    user_input: str                   # raw user message
    mode: str                         # "trend" | "occasion" | None
    channels: list[str]               # ["instagram"] | ["email"] | ["instagram", "email"]
    follow_up_needed: bool            # supervisor needs more info from user
    follow_up_question: str           # question to send back to frontend
    occasion_brief: dict              # collected occasion/event info
    trend_options: list[dict]         # 5–7 trends returned by trend analyzer
    selected_trend: dict              # user-confirmed trend
    generated_images: list[str]       # GCS URLs of generated images
    generated_captions: list[str]     # Instagram caption options
    generated_emails: list[dict]      # [{subject, body}] options
    approval_result: dict             # {passed, notes, per_item: [...]}
    iteration_count: int              # approval retry counter (max 5)
    refine_instruction: str           # user's refine note from human review
    selected: dict                    # user's final picks {image_url, caption, email}
    publish_result: dict              # result after publishing
```

---

### Step 1 — Supervisor Agent

- Entry point for every user message
- Uses Gemini to extract from `user_input`:
  - `mode`: trend / occasion / unknown
  - `channels`: instagram / email / both / unknown
- If either is unknown → set `follow_up_needed=True`, write `follow_up_question`, stop graph, return question to frontend
- If mode = **occasion** → extract event name, date, and any context from input, populate `occasion_brief`
- If mode = **trend** → route to Trend Analyzer
- On **Refine** path (from human review) → reads `refine_instruction` + previously `selected` content → decides which sub-agent to re-run (image / caption / email / all) → routes back into Content Generator with the refine context

---

### Step 2 — Trend Analyzer Agent

- Runs only when `mode == "trend"`
- Calls Gemini 2.5 Pro with Google Search Grounding
- Uses `user_context.location` + current date as grounding context
- Returns **5–7 trend options**, each with: title, description, suggested hashtags, why it fits the brand
- Stores in `trend_options` → **interrupt here** → send options to frontend for user to pick one
- If user replies with "fetch more trends" or similar → graph resumes, Trend Analyzer runs again and fetches a fresh set of 5–7 trends (loop until user picks one)
- On user pick → store in `selected_trend` → continue to Content Generator

---

### Step 3 — Content Generator Agent

Runs sub-agents based on `channels`. Every sub-agent receives the **full user context**:
`business_name`, `industry`, `description`, `brand_colors`, `logo_gcs_url`, `tagline`, `tone`,
`image_style`, `target_audience`, `age_group`, `gender`, `interests`, `content_types`,
`guidelines` (topics to avoid), `language` — plus `occasion_brief` or `selected_trend`.

**3a. Image Agent** (if `instagram` in channels)
- Model selection:
  - User has logos or product photos in context → use **Gemini 2.6 Flash** (edit/composite with brand assets)
  - Generating from scratch → use **Imagen 4.0**
- Prompt includes: brand colors, logo placement, tone, image style, occasion/trend theme, aspect ratio (1:1 or 4:5)
- Generate 3–4 options → upload to GCS → store URLs in `generated_images`

**3b. Caption Agent** (if `instagram` in channels)
- Gemini 2.5 Pro
- Input: full user context + trend/occasion brief + image descriptions
- Output: 3–4 caption options with hashtags in the brand's `language` and `tone`
- Stored in `generated_captions`

**3c. Email Agent** (if `email` in channels)
- Gemini 2.5 Pro
- Input: full user context + trend/occasion brief
- Output: 3–4 `{subject, body}` options matching brand tone, language, and guidelines
- Stored in `generated_emails`

---

### Step 4 — Approval Agent

- Receives: original `user_input`, `occasion_brief` or `selected_trend`, full `user_context`, and all generated content
- Runs **Gemini 2.5 Pro Vision** on each generated image:
  - Spelling and grammar in any text within the image
  - Logo present and not obscured
  - Brand colors aligned with `user_context.brand_colors`
  - Image relevant to the trend/occasion
  - No offensive or inappropriate content
- Runs text checks on captions and emails:
  - Grammar and spelling
  - Tone matches `user_context.tone`
  - Hashtag relevance (Instagram)
  - Language matches `user_context.language`
  - No topics from `user_context.guidelines` (avoid list)
- Output: `approval_result = {passed: bool, notes: str, per_item: [...]}`
- **If all fail AND `iteration_count < 5`** → increment counter, loop back to Content Generator with failure notes attached
- **If all fail AND `iteration_count >= 5`** → pass through with a warning flag, surface best available to user

---

### Step 5 — Human Review Node (LangGraph interrupt)

- LangGraph `interrupt()` pauses graph here
- Frontend displays:
  - Image carousel (approved images to choose from)
  - Caption selector (if instagram)
  - Email subject + body selector (if email)
  - Two actions: **Publish** or **Refine**
- On **Publish**: user picks one image, one caption, one email → stored in `selected` → graph resumes → Publisher
- On **Refine**: user types a refinement instruction → `refine_instruction` set → graph resumes → back to Supervisor, which re-delegates to the relevant sub-agent(s) → Approval → Human Review (loop, no iteration cap on refine)

---

### Step 6 — Publisher Agent

- If `instagram` in channels → Meta Graph API → post `selected.image_url` + `selected.caption`
- If `email` in channels → SendGrid API → send `selected.email.subject` + `selected.email.body` to email list
- Write row(s) to `published_content.posts` in BigQuery (one row per channel)
- Store result in `publish_result`

---

### Graph Edges & Loop Conditions

```
START
  → supervisor_node
      → [follow_up_needed=True]  →  END  (frontend asks follow-up, user replies, restart)
      → [mode=trend]             →  trend_analyzer_node
                                       → interrupt (user picks trend OR requests more trends → loop)
                                       → content_generator_node
      → [mode=occasion]          →  content_generator_node
      → [refine path]            →  content_generator_node  (targeted re-run)

  → content_generator_node
      → approval_node
            → [all fail AND iter < 5]   →  content_generator_node  (retry with failure notes)
            → [pass OR iter >= 5]       →  human_review_node  [interrupt]
                  → [publish]  →  publisher_node  →  END
                  → [refine]   →  supervisor_node  ← refine loop (no cap)
```

---

### Step 7 — FastAPI Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /campaign/start` | Creates LangGraph thread, runs graph with first user message |
| `POST /campaign/reply` | Sends follow-up answer or trend pick, resumes graph |
| `POST /campaign/refine` | Sends refine instruction from human review, resumes from supervisor |
| `POST /campaign/publish` | Sends final picks (image + caption + email), resumes to publisher |
| `GET /campaign/status/{thread_id}` | Returns current stage + any data the frontend needs to render |

---

### Step 8 — Frontend Campaign Flow

- `/campaign/new` — chat-style input, user describes what they want
- Supervisor follow-up → question appears as chat bubble, user replies inline
- Trend mode → trend cards (5–7) displayed; "Fetch more" button loops trend analyzer
- Content review page → image carousel + caption selector + email selector + Publish / Refine buttons
- Refine → text input for instruction, spinner while agents re-run, updated content shown
- Post-publish → confirmation screen with Instagram post URL + email delivery summary

---

### Build Order

```
GraphState → Supervisor → stub graph (all nodes pass-through) → test flow end-to-end
→ Trend Analyzer → Content Generator (image → caption → email) → Approval → Human Review → Publisher
→ FastAPI endpoints → Frontend campaign flow
```

---

## External Integrations Checklist
- [ ] Meta Developer App — Instagram Graph API credentials
- [ ] SendGrid account + API key
- [ ] GCS bucket created (`social-content-agent-assets`)
- [ ] BigQuery dataset + tables created
- [ ] Firebase Auth / Google OAuth configured
- [ ] Vertex AI APIs enabled (Gemini, Imagen, Search Grounding)

---

## Current Progress Summary

| Phase | Status |
|---|---|
| 1 — Setup & Infrastructure | Not started |
| 2 — FastAPI + Auth + Onboarding | Not started |
| 3 — LangGraph Scaffold | Not started |
| 4 — Trend Analyzer Agent | Not started |
| 5 — Content Generator Agent | Not started |
| 6 — Approval Agent | Not started |
| 7 — Human Review Node | Not started |
| 8 — Publisher Agent | Not started |
| 9 — Next.js Frontend | Not started |
| 10 — Cloud Run Deployment | Not started |

**Overall: Planning complete. Ready to start Phase 1.**

---

## Notes
- Reuse from existing `imagen-gen` project: SDK client init (ADC), Imagen 4.0 `generate_images` + GCS output handling, `uv` + `.venv` pattern
- Only approved images are ever shown to the user
- Every published post is written to `published_content.posts` in BigQuery — one row per channel, per publish event
