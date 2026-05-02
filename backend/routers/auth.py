import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from jose import jwt

from config import settings
from db.bigquery import get_user_by_email, insert_user
from dependencies import get_current_user
from models.user import UserContext

router = APIRouter(prefix="/auth", tags=["auth"])

_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

_state_store: dict[str, str] = {}  # state -> code_verifier


def _make_flow() -> Flow:
    return Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH_CLIENT_SECRET_FILE,
        scopes=_SCOPES,
        redirect_uri=settings.GOOGLE_OAUTH_REDIRECT_URI,
    )


def _make_jwt(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


@router.get("/google")
def login_google():
    flow = _make_flow()
    auth_url, state = flow.authorization_url(
        prompt="consent",
        access_type="offline",
    )
    # google-auth-oauthlib auto-generates a PKCE verifier; store it for the callback
    _state_store[state] = getattr(flow, "code_verifier", "") or ""
    return RedirectResponse(auth_url)


@router.get("/google/callback")
async def google_callback(code: str, state: str):
    if state not in _state_store:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    code_verifier = _state_store.pop(state)

    flow = _make_flow()
    kwargs: dict = {"code": code}
    if code_verifier:
        kwargs["code_verifier"] = code_verifier
    flow.fetch_token(**kwargs)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {flow.credentials.token}"},
        )
    user_info = resp.json()
    email: str = user_info["email"]

    existing = get_user_by_email(email)
    if existing:
        user_id = existing["user_id"]
        is_new = False
    else:
        user_id = str(uuid.uuid4())
        insert_user(user_id, email)
        is_new = True

    token = _make_jwt(user_id)
    redirect = f"{settings.FRONTEND_URL}/auth/callback?token={token}&is_new={str(is_new).lower()}"
    return RedirectResponse(redirect)


@router.get("/me", response_model=UserContext)
def get_me(current_user: UserContext = Depends(get_current_user)):
    return current_user
