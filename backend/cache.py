from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from models.user import UserContext

_cache: dict[str, "UserContext"] = {}


def get_cached_user(user_id: str) -> Optional["UserContext"]:
    return _cache.get(user_id)


def set_cached_user(ctx: "UserContext") -> None:
    _cache[ctx.user_id] = ctx


def invalidate_user(user_id: str) -> None:
    _cache.pop(user_id, None)
