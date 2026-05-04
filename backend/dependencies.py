from datetime import datetime
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from config import settings
from db.bigquery import get_user, get_user_products
from models.user import UserContext, Product
from cache import get_cached_user, set_cached_user

_security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> UserContext:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    cached = get_cached_user(user_id)
    if cached:
        return cached

    row = get_user(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    valid = UserContext.model_fields.keys()
    def _coerce(v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v
    # Skip None values — pydantic uses field defaults (e.g. plan="free") instead of failing on None
    ctx = UserContext(**{k: _coerce(v) for k, v in row.items() if k in valid and _coerce(v) is not None})
    # Load products separately — not stored in the main users table
    product_rows = get_user_products(user_id)
    ctx = ctx.model_copy(update={"products": [Product(**p) for p in product_rows]})
    set_cached_user(ctx)
    return ctx
