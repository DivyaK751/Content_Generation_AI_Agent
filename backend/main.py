import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth, onboarding, brand_kit, campaign

os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # allow HTTP in local dev

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
)
# Keep noisy third-party loggers quiet
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("watchfiles").setLevel(logging.WARNING)

app = FastAPI(title="Social Content Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(onboarding.router)
app.include_router(brand_kit.router)
app.include_router(campaign.router)


@app.get("/health")
def health():
    return {"status": "ok"}
