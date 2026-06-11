import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, status

from app.core.config import get_settings
from app.models.user import User, UserSession

PBKDF2_ITERATIONS = 600_000


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(user: User) -> tuple[str, UserSession]:
    settings = get_settings()
    token = secrets.token_urlsafe(48)
    session = UserSession(
        token_hash=hash_session_token(token),
        user_id=str(user.id),
        expires_at=utc_now() + timedelta(days=settings.session_days),
    )
    await session.insert()
    return token, session


async def get_current_user(
    session_token: str | None = Cookie(default=None, alias=get_settings().auth_cookie_name),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")

    session = await UserSession.find_one(UserSession.token_hash == hash_session_token(session_token))
    if session is None or session.expires_at <= utc_now():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已过期")

    user = await User.get(session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号不可用")
    return user


def require_role(role: str):
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此功能")
        return user

    return dependency


require_user = require_role("user")
require_admin = require_role("admin")


async def ensure_initial_admin() -> None:
    settings = get_settings()
    if not settings.admin_username or not settings.admin_initial_password:
        return

    existing = await User.find_one(User.username == settings.admin_username.strip())
    if existing is not None:
        return

    admin = User(
        username=settings.admin_username.strip(),
        password_hash=hash_password(settings.admin_initial_password),
        role="admin",
    )
    await admin.insert()
