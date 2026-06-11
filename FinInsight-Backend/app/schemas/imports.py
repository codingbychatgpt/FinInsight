from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

from app.schemas.article import ArticleResponse


class ImportPreviewRequest(BaseModel):
    url: HttpUrl


class ImportPreviewResponse(BaseModel):
    existing_article_id: str | None = None
    url: str
    title: str
    source: str
    publish_date: datetime
    raw_content: str


class ConfirmImportRequest(BaseModel):
    url: HttpUrl
    title: str = Field(min_length=1, max_length=500)
    source: str = Field(min_length=1, max_length=200)
    publish_date: datetime
    raw_content: str = Field(min_length=100, max_length=300_000)
    ingestion_method: Literal["url_import", "web_search"] = "url_import"


class ConfirmImportResponse(BaseModel):
    article: ArticleResponse
    created: bool


class WebSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=120)


class WebSearchResult(BaseModel):
    title: str
    url: str
    summary: str = ""
    publish_date: str = ""


class WebSearchResponse(BaseModel):
    results: list[WebSearchResult]
