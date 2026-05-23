from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AIInterpretationResponse(BaseModel):
    id: str | None = None
    core_summary: str
    banker_perspective: str
    public_perspective: str
    impact_score: int
    keywords: list[str] = Field(default_factory=list)


class ArticleResponse(BaseModel):
    id: str
    title: str
    source: str
    publish_date: datetime
    raw_content: str
    url: str
    status: Literal["pending", "parsed", "failed"]
    interpretation: AIInterpretationResponse


class ArticleListResponse(BaseModel):
    articles: list[ArticleResponse]


class SyncArticleResponse(BaseModel):
    article_id: str
    title: str
    url: str
    source: str
    impact_score: int
    keywords: list[str] = Field(default_factory=list)


class FailedArticleResponse(BaseModel):
    title: str
    url: str
    reason: str


class SyncResponse(BaseModel):
    candidate_count: int
    attempted_count: int
    processed_count: int
    skipped_count: int
    failed_count: int
    articles: list[SyncArticleResponse]
    failed_articles: list[FailedArticleResponse]
