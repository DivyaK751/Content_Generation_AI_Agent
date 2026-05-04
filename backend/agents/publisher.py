import csv
import io
import json
import logging
import time
import uuid
from datetime import datetime, timezone

import httpx

from config import settings
from agents.state import GraphState
from db.bigquery import insert_campaign

logger = logging.getLogger(__name__)

_META_API = "https://graph.facebook.com/v19.0"
_SENDGRID_API = "https://api.sendgrid.com/v3/mail/send"


# ── Instagram ──────────────────────────────────────────────────────────────────

def _poll_container_ready(creation_id: str, token: str, max_wait: int = 60) -> tuple[bool, str]:
    """Poll container status until FINISHED or ERROR. Instagram needs time to process media."""
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            resp = httpx.get(
                f"{_META_API}/{creation_id}",
                params={"fields": "status_code", "access_token": token},
                timeout=10,
            )
            resp.raise_for_status()
            status = resp.json().get("status_code", "IN_PROGRESS")
            logger.info(f"Instagram container {creation_id} status: {status}")
            if status == "FINISHED":
                return True, status
            if status in ("ERROR", "EXPIRED"):
                return False, status
        except Exception as exc:
            logger.warning(f"Status poll error: {exc}")
        time.sleep(3)
    return False, "TIMEOUT"


def _post_instagram(image_url: str, caption: str, ctx) -> dict:
    if not ctx.instagram_page_id or not ctx.instagram_access_token:
        return {"skipped": True, "reason": "No Instagram credentials configured"}

    token = ctx.instagram_access_token
    page_id = ctx.instagram_page_id

    # Step 1: create media container
    try:
        create_resp = httpx.post(
            f"{_META_API}/{page_id}/media",
            params={
                "image_url": image_url,
                "caption": caption,
                "access_token": token,
            },
            timeout=30,
        )
        create_resp.raise_for_status()
        creation_id = create_resp.json().get("id")
        if not creation_id:
            return {"error": f"No creation_id in response: {create_resp.text}"}
    except Exception as exc:
        logger.error(f"Instagram media container creation failed: {exc}")
        return {"error": str(exc)}

    # Step 1.5: wait for container to finish processing
    ready, status = _poll_container_ready(creation_id, token)
    if not ready:
        logger.error(f"Instagram container not ready: {status}")
        return {"error": f"Media container did not finish processing (status: {status})", "creation_id": creation_id}

    # Step 2: publish container
    try:
        publish_resp = httpx.post(
            f"{_META_API}/{page_id}/media_publish",
            params={"creation_id": creation_id, "access_token": token},
            timeout=30,
        )
        publish_resp.raise_for_status()
        post_id = publish_resp.json().get("id")
        logger.info(f"Instagram: published post {post_id}")
        return {"post_id": post_id, "creation_id": creation_id}
    except Exception as exc:
        logger.error(f"Instagram media_publish failed: {exc}")
        return {"error": str(exc), "creation_id": creation_id}


# ── Email (SendGrid) ───────────────────────────────────────────────────────────

def _load_recipients(user_id: str) -> list[str]:
    """Download the user's email list CSV from GCS and return all email addresses."""
    csv_url = f"https://storage.googleapis.com/{settings.GCS_BUCKET_NAME}/email-lists/{user_id}/contacts.csv"
    try:
        resp = httpx.get(csv_url, timeout=15, follow_redirects=True)
        if resp.status_code == 404:
            logger.info("Email list CSV not found in GCS — no recipients")
            return []
        resp.raise_for_status()
        reader = csv.DictReader(io.StringIO(resp.text))
        emails = []
        for row in reader:
            # Accept columns named 'email', 'Email', or 'EMAIL'
            addr = row.get("email") or row.get("Email") or row.get("EMAIL") or ""
            addr = addr.strip()
            if addr and "@" in addr:
                emails.append(addr)
        logger.info(f"Email list: loaded {len(emails)} recipients")
        return emails
    except Exception as exc:
        logger.warning(f"Could not load email list: {exc}")
        return []


def _send_email(subject: str, body: str, ctx) -> dict:
    if not ctx.sendgrid_api_key:
        return {"skipped": True, "reason": "No SendGrid API key configured"}
    if not ctx.sender_email:
        return {"skipped": True, "reason": "No sender email configured"}

    recipients = _load_recipients(ctx.user_id)
    if not recipients:
        # Fall back to sender's own address as a test send
        recipients = [ctx.sender_email]
        logger.info("No email list found — sending to sender_email as test")

    html_body = body.replace("\n", "<br>")

    payload = {
        "personalizations": [{"to": [{"email": r} for r in recipients]}],
        "from": {
            "email": ctx.sender_email,
            "name": ctx.sender_name or ctx.business_name or ctx.sender_email,
        },
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}],
    }

    try:
        resp = httpx.post(
            _SENDGRID_API,
            headers={
                "Authorization": f"Bearer {ctx.sendgrid_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        # SendGrid returns 202 on success (no body)
        if resp.status_code in (200, 202):
            message_id = resp.headers.get("X-Message-Id", "")
            logger.info(f"Email sent — {len(recipients)} recipients, message_id={message_id}")
            return {"message_id": message_id, "recipient_count": len(recipients)}
        else:
            logger.error(f"SendGrid error {resp.status_code}: {resp.text}")
            return {"error": f"HTTP {resp.status_code}: {resp.text}"}
    except Exception as exc:
        logger.error(f"SendGrid send failed: {exc}")
        return {"error": str(exc)}


# ── Node ──────────────────────────────────────────────────────────────────────

def publisher_node(state: GraphState) -> dict:
    ctx = state["user_context"]
    channels = state.get("channels", [])
    selected = state.get("selected", {})

    brief = state.get("selected_trend") or state.get("occasion_brief") or {}
    theme = brief.get("title") or brief.get("event", "campaign")

    image_url = selected.get("image_url") or (state.get("generated_images") or [None])[0]
    caption = selected.get("caption") or (state.get("generated_captions") or [None])[0]
    email_data = selected.get("email") or (state.get("generated_emails") or [{}])[0]

    campaign_id = str(uuid.uuid4())
    ig_result: dict = {}
    email_result: dict = {}

    logger.info("=" * 60)
    logger.info(f"[PUBLISHER ▶] Node started — campaign_id={campaign_id}")
    logger.info(f"[PUBLISHER ▶] Channels: {channels}, theme: {theme!r}")
    logger.info(f"[PUBLISHER ▶] Selected image: {image_url!r}")
    logger.info(f"[PUBLISHER ▶] Selected caption (first 80 chars): {str(caption)[:80]!r}")

    # ── Instagram ──
    if "instagram" in channels and not ctx.can_post_instagram:
        ig_result = {"skipped": True, "reason": "Plan upgrade required for Instagram posting"}
        logger.warning("[PUBLISHER ▶] Instagram skipped — plan does not include Instagram posting")
    elif "instagram" in channels and image_url and caption:
        logger.info("[PUBLISHER ▶] Posting to Instagram via Meta Graph API v19.0")
        ig_result = _post_instagram(image_url, caption, ctx)
        logger.info(f"[PUBLISHER ▶] Instagram result: {ig_result}")
    elif "instagram" in channels:
        ig_result = {"skipped": True, "reason": "Missing image or caption"}
        logger.warning("[PUBLISHER ▶] Instagram skipped — missing image or caption")

    # ── Email ──
    if "email" in channels and email_data:
        logger.info("[PUBLISHER ▶] Sending email via SendGrid")
        email_result = _send_email(
            subject=email_data.get("subject", f"{ctx.business_name} — {theme}"),
            body=email_data.get("body", ""),
            ctx=ctx,
        )
    elif "email" in channels:
        email_result = {"skipped": True, "reason": "No email content"}

    logger.info(f"[PUBLISHER ▶] Email result: {email_result}")

    all_images: list[str] = state.get("generated_images") or []
    if image_url and image_url not in all_images:
        all_images = [image_url] + all_images

    # ── BigQuery record ──
    logger.info("[PUBLISHER ▶] Saving campaign record to BigQuery")
    try:
        insert_campaign({
            "campaign_id": campaign_id,
            "user_id": ctx.user_id,
            "channels": json.dumps(channels),
            "mode": state.get("mode", ""),
            "theme": theme,
            "image_url": image_url or "",
            "all_image_urls": json.dumps(all_images),
            "caption": caption or "",
            "email_subject": email_data.get("subject", "") if email_data else "",
            "email_body": email_data.get("body", "") if email_data else "",
            "instagram_post_id": ig_result.get("post_id", ""),
            "sendgrid_message_id": email_result.get("message_id", ""),
            "status": "published",
        })
        logger.info("[PUBLISHER ▶] Campaign record saved to BigQuery")
    except Exception as exc:
        logger.error(f"[PUBLISHER ▶] BigQuery insert failed: {exc}")

    logger.info(f"[PUBLISHER ▶] Node complete — campaign {campaign_id} done")
    return {
        "publish_result": {
            "campaign_id": campaign_id,
            "status": "published",
            "channels": channels,
            "theme": theme,
            "instagram": ig_result,
            "email": email_result,
            "image_url": image_url,
            "all_image_urls": all_images,
            "caption": caption,
            "email_subject": email_data.get("subject") if email_data else None,
            "email_body": email_data.get("body") if email_data else None,
        }
    }
