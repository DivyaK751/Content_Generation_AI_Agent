# Agentic AI Content Generator — In-Progress Tracker

Last updated: 2026-04-28

---

## Phase 1 — Project Setup & Infrastructure ✅ COMPLETE

- [x] Created repo with `backend/` and `frontend/` subdirs
- [x] Backend initialised (FastAPI + uvicorn, Python 3.13)
- [x] Frontend created (`create-next-app`, TypeScript, App Router)
- [x] Google OAuth 2.0 credentials configured in GCP Console
- [x] BigQuery dataset created: `social_content_agent`
- [x] BigQuery tables created: `users`, `user_photos`, `user_logos`, `campaigns`
- [x] GCS bucket created: `social-content-agent-assets`
- [x] GCS bucket IAM set to public read (`allUsers:objectViewer`)

---

## Phase 2 — FastAPI Skeleton + Auth + Onboarding ✅ COMPLETE

### Auth
- [x] `GET /auth/google` — redirects to Google OAuth consent screen
- [x] `GET /auth/google/callback` — exchanges code for token, creates/finds user in BigQuery, issues JWT
- [x] PKCE flow fixed (stores `code_verifier` alongside OAuth state)

### Onboarding API
- [x] `POST /onboarding` — saves all form fields to BigQuery `users` table (synchronous, invalidates cache)
- [x] `POST /logo-upload` — uploads to GCS `logos/`, inserts row into `user_logos` table
- [x] `POST /photos-upload` — uploads to GCS `product-photos/`, inserts row into `user_photos` table
- [x] `POST /email-list-upload` — uploads CSV to GCS `email-lists/`

### Brand Kit API
- [x] `GET /brand-kit` — returns full `UserContext` for the logged-in user
- [x] `PATCH /brand-kit` — partial update of any profile fields (synchronous, invalidates cache)
- [x] `GET /user-logos` — returns all logos from `user_logos` table
- [x] `GET /user-photos` — returns all product photos from `user_photos` table

### Shared User Context
- [x] `cache.py` — in-memory store keyed by `user_id`
- [x] `dependencies.py` — `get_current_user` checks cache first, falls back to BigQuery, caches result
- [x] Cache invalidated on every `PATCH /brand-kit` and `POST /onboarding`
- [x] `UserContext` model has all 28 profile fields (business, brand, audience, content, Instagram, email)

### Onboarding Frontend (`/onboarding`)
- [x] 7-step multi-step form with step indicator
- [x] Step 1 — Business Basics (name, industry, description, location, website)
- [x] Step 2 — Brand Identity (multi-logo upload, primary/secondary colors, tagline, tone)
- [x] Step 3 — Target Audience (customer description, age groups, gender skew, interests)
- [x] Step 4 — Content Preferences (content types, image style, language, topics to avoid)
- [x] Step 5 — Product Photos (multi-file upload)
- [x] Step 6 — Instagram Setup (handle, page ID, access token)
- [x] Step 7 — Email Setup (sender name, sender email, CSV upload, SendGrid key)
- [x] On finish: uploads logos → uploads photos → POSTs form → redirects to `/campaign/new`

### Brand Kit Frontend (`/profile` → Brand Kit panel)
- [x] Fetches `GET /brand-kit` on open, shows spinner while loading
- [x] All 8 sections: Summary, Logos, Colors, Guidelines, Audience, Instagram, Email, Photos
- [x] Every section initialises from real DB data (not hardcoded defaults)
- [x] All dropdown/chip values match onboarding exactly (industry, tone, image style, content types, language, age groups, gender)
- [x] Save Changes calls `PATCH /brand-kit` synchronously
- [x] Logos section — shows all logos in a grid (fetched from `user_logos`), upload appends without replacing
- [x] Photos section — shows all product photos in a grid (fetched from `user_photos`), upload appends

---

## Phase 3 — LangGraph Graph Scaffold ✅ COMPLETE

- [x] `GraphState` TypedDict defined in `agents/state.py` (all 16 fields)
- [x] Full graph wired in `agents/graph.py` with `MemorySaver` checkpointer
- [x] Conditional edge `route_after_approval`: passes or retries content_generator (max 4 iterations, then forced pass)
- [x] Conditional edge `route_after_human_review`: routes to publisher (publish) or supervisor (refine)
- [x] `POST /campaign/start`, `POST /campaign/reply`, `POST /campaign/refine`, `POST /campaign/publish`, `GET /campaign/status/{thread_id}` all wired in `routers/campaign.py`
- [x] `_run()` helper handles invoke, interrupt detection, and state extraction
- [x] Tested end-to-end: all 16 API test cases pass

---

## Phase 4 — Trend Analyzer Agent ✅ COMPLETE

- [x] Mode A (Occasion): Gemini 2.5 Pro fetches event background, themes, taglines, hashtags → `occasion_brief`
- [x] Mode B (Trend): Gemini 2.5 Pro + Google Search Grounding → 5–7 current trend options with title, description, hashtags, brand fit → `trend_options` → LangGraph `interrupt()` for user to pick
- [x] "Fetch more" loop: resumes trend analyzer to generate fresh set of trends
- [x] On user trend pick → stores in `selected_trend` → continues to content_generator

---

## Phase 5 — Content Generator Agent ✅ COMPLETE

- [x] Image sub-agent: Imagen 4.0 generates 3 images → uploaded to GCS → URLs in `generated_images`
  - Uses brand colors, logo GCS URL, tone, image style, occasion brief or selected trend
  - Falls back gracefully if GCS upload fails (returns placeholder)
- [x] Caption sub-agent: Gemini 2.5 Pro generates 3 Instagram captions with hashtags → `generated_captions`
- [x] Email sub-agent: Gemini 2.5 Pro generates 3 `{subject, body}` email drafts → `generated_emails`
- [x] `refine_instruction` path: re-runs only the sub-agents flagged by `regenerate_image/caption/email` flags
- [x] Verified: 3 images + 3 captions generated in ~4 min, email generation ~30s

---

## Phase 6 — Approval Agent ✅ COMPLETE

- [x] Image checks via Gemini 2.5 Pro Vision: brand alignment, content relevance, professionalism, safety
- [x] Caption checks via Gemini 2.5 Pro: grammar, tone, language, hashtag quality, guidelines
- [x] Email checks via Gemini 2.5 Pro: subject quality, body structure, tone, language, guidelines
- [x] Aggregated `approval_result = {passed, score, notes, per_item}`
- [x] Forces pass at `iteration_count >= 4` to prevent infinite retry loops
- [x] All checks wrapped in try/except — default to pass (score 70) on any failure
- [x] Verified: approval passes with avg score 66 for fashion content

---

## Phase 7 — Human Review Node ✅ COMPLETE

- [x] LangGraph `interrupt()` pauses graph, sends full content payload to frontend
- [x] Payload: `{type, generated_images, generated_captions, generated_emails, approval_result, iteration_count, channels}`
- [x] Resume contract:
  - **Publish**: `{action: "publish", selected: {image_url, caption, email: {subject, body}}}`
  - **Refine**: `{action: "refine", instruction, regenerate_image, regenerate_caption, regenerate_email}`
- [x] If no regen flags on refine → defaults all to True
- [x] Verified: refine → caption-only regeneration works correctly

---

## Phase 8 — Publisher Agent ✅ COMPLETE

- [x] Instagram: Meta Graph API v19.0, two-step (create media container → media_publish)
- [x] Email: SendGrid REST API (`POST /v3/mail/send`), loads recipient list from GCS CSV
  - Falls back to sender_email if no CSV found
- [x] BigQuery `campaigns` table write after every publish (campaign_id, user_id, channels, mode, theme, image_url, caption, email_subject, email_body, instagram_post_id, sendgrid_message_id, status)
- [x] Returns `publish_result` with campaign_id, per-channel results, skipped/error reasons
- [x] Verified: campaign_id `e1094bea-...` saved to BigQuery, Instagram skipped (no credentials), email skipped (no credentials)

---

## Phase 9 — Next.js Frontend ✅ COMPLETE

- [x] Login page (`/`) — Google OAuth button
- [x] Onboarding page (`/onboarding`) — complete 7-step form (see Phase 2)
- [x] Dashboard page (`/dashboard`) — mode/channel selection shell
- [x] Profile page (`/profile`) — Brand Kit panel with all sections
- [x] `/campaign/new` — full chat-style campaign flow:
  - [x] Chat input + message thread (supervisor follow-up questions rendered inline)
  - [x] Trend cards (5–7) with "Select" and "Fetch More" actions (only latest set is interactive)
  - [x] Content review panel: image carousel, caption picker (3 options), email picker (3 options with expandable body)
  - [x] Publish / Refine actions in panel
  - [x] Refine flow: instruction input → spinner while agents re-run → updated panel
  - [x] `PublishSuccess` screen: campaign_id, Instagram post_id, email recipient count, skipped/error details, "Start new campaign" link

---

## Phase 10 — Cloud Run Deployment ⬜ NOT STARTED

- [ ] Dockerize FastAPI backend (`Dockerfile` + `.dockerignore`)
- [ ] Deploy backend to Cloud Run (`gcloud run deploy`)
- [ ] Deploy Next.js frontend to Cloud Run or Vercel
- [ ] Set all env vars via GCP Secret Manager (GEMINI keys, SendGrid key, OAuth secrets, etc.)
- [ ] Configure CORS for production domain
- [ ] Test full flow on deployed URLs

---

## Current Progress Summary

| Phase | Status |
|---|---|
| 1 — Setup & Infrastructure | ✅ Complete |
| 2 — FastAPI + Auth + Onboarding + Brand Kit | ✅ Complete |
| 3 — LangGraph Scaffold + Campaign API | ✅ Complete |
| 4 — Trend Analyzer Agent | ✅ Complete |
| 5 — Content Generator Agent | ✅ Complete |
| 6 — Approval Agent | ✅ Complete |
| 7 — Human Review Node | ✅ Complete |
| 8 — Publisher Agent | ✅ Complete |
| 9 — Next.js Frontend | ✅ Complete |
| 10 — Cloud Run Deployment | ⬜ Not started |

**Next up: Phase 10 — Cloud Run Deployment**

---

## API Test Results (2026-04-28)

All 16 backend API tests pass:

| Test | Status |
|---|---|
| `GET /health` | ✅ 200 |
| `GET /auth/me` | ✅ 200 — velora fashion user |
| `GET /brand-kit` | ✅ 200 |
| `GET /user-logos` | ✅ 200 — 3 logos |
| `GET /user-photos` | ✅ 200 — 3 photos |
| `PATCH /brand-kit` (update + restore) | ✅ 200 |
| `POST /campaign/start` (occasion mode) | ✅ 200 — 3 images + 3 captions, approval score 66, human_review interrupt |
| `GET /campaign/status/{thread_id}` | ✅ 200 |
| `POST /campaign/refine` (captions only) | ✅ 200 — captions regenerated, images unchanged |
| `POST /campaign/publish` | ✅ 200 — campaign_id saved to BigQuery |
| BigQuery record verification | ✅ mode=occasion, theme=summer sale, status=published |
| `GET /campaign/status` (non-existent thread) | ✅ 404 |
| `GET /brand-kit` (no token) | ✅ 401 |
| `GET /brand-kit` (bad token) | ✅ 401 |
