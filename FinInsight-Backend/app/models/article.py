from datetime import datetime
from typing import List, Literal

from beanie import Document, Indexed, Link
from pymongo import DESCENDING, IndexModel


class PolicyArticle(Document):
    title: Indexed(str)
    source: str
    publish_date: datetime
    raw_content: str
    url: Indexed(str, unique=True)
    status: Literal["pending", "parsed", "failed"] = "pending"
    session_id: str | None = None
    ingestion_method: Literal["sync", "url_import", "web_search"] = "sync"
    imported_by: str | None = None

    class Settings:
        name = "policy_articles"
        indexes = [
            IndexModel([("publish_date", DESCENDING)]),
            IndexModel([("session_id", DESCENDING)]),
        ]


class AIInterpretation(Document):
    article_id: Link[PolicyArticle]
    core_summary: str
    banker_perspective: str
    public_perspective: str
    impact_score: int
    keywords: List[str]

    class Settings:
        name = "ai_interpretations"
