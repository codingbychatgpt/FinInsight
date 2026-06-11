from datetime import datetime, timezone
from typing import Literal

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Document):
    username: Indexed(str, unique=True)
    password_hash: str
    role: Literal["user", "admin"]
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "users"


class UserSession(Document):
    token_hash: Indexed(str, unique=True)
    user_id: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "user_sessions"
        indexes = [
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
            IndexModel([("user_id", ASCENDING)]),
        ]
