import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_user
from app.models.article import AIInterpretation, PolicyArticle
from app.api.v1.articles import serialize_article
from app.schemas.article import ArticleResponse, SyncResponse
from app.services.crawler import (
    LOCAL_TIMEZONE,
    FullTextFetchFailed,
    fetch_latest_news,
    scrape_article_content,
)

router = APIRouter(tags=["sync"], dependencies=[Depends(require_user)])
logger = logging.getLogger(__name__)
sync_lock = asyncio.Lock()
MAX_NEW_ARTICLES_PER_SYNC = 15
MIN_NEW_ARTICLES_PER_SYNC = 10
EXTRA_CANDIDATES_FOR_FAILURES = 10
MAX_SCRAPE_CONCURRENCY = 8
ARTICLE_SCRAPE_TIMEOUT_SECONDS = 22
MAX_LOOKBACK_DAYS = 2


@dataclass
class SyncAttemptResult:
    candidate_count: int
    attempted_count: int
    processed_articles: list[ArticleResponse] = field(default_factory=list)
    failed_articles: list[dict[str, str]] = field(default_factory=list)
    skipped_count: int = 0


@dataclass
class ScrapeResult:
    item: dict[str, Any]
    raw_content: str | None = None
    error: Exception | None = None


@router.post("/sync", response_model=SyncResponse)
async def sync_latest_news() -> SyncResponse:
    if sync_lock.locked():
        raise HTTPException(status_code=409, detail="A sync task is already running")

    async with sync_lock:
        current_session_id = uuid4().hex
        attempt = await _run_sync_attempt(
            current_session_id,
            _primary_since_boundary(),
            max_new_articles=MAX_NEW_ARTICLES_PER_SYNC,
        )

        if len(attempt.processed_articles) < MIN_NEW_ARTICLES_PER_SYNC:
            remaining_count = MAX_NEW_ARTICLES_PER_SYNC - len(attempt.processed_articles)
            logger.info(
                "Only %s new articles in primary sync window; retrying with wider lookback",
                len(attempt.processed_articles),
            )
            fallback_attempt = await _run_sync_attempt(
                current_session_id,
                _fallback_since_boundary(),
                max_new_articles=remaining_count,
            )
            attempt = _merge_sync_attempts(attempt, fallback_attempt)

        success_new_count = len(attempt.processed_articles)

        return SyncResponse(
            synced_count=success_new_count,
            purged_count=0,
            status="updated" if success_new_count > 0 else "kept",
            candidate_count=attempt.candidate_count,
            attempted_count=attempt.attempted_count,
            processed_count=success_new_count,
            skipped_count=attempt.skipped_count,
            failed_count=len(attempt.failed_articles),
            articles=attempt.processed_articles,
            failed_articles=attempt.failed_articles,
        )


async def _run_sync_attempt(
    current_session_id: str,
    since: datetime,
    max_new_articles: int,
) -> SyncAttemptResult:
    news_items = await fetch_latest_news(since=since)
    candidate_items: list[dict[str, Any]] = []
    failed_articles: list[dict[str, str]] = []
    processed_articles: list[ArticleResponse] = []
    skipped_count = 0
    attempted_count = 0
    candidate_limit = max_new_articles + EXTRA_CANDIDATES_FOR_FAILURES

    for item in news_items:
        if len(candidate_items) >= candidate_limit:
            break

        attempted_count += 1
        existing_article = await PolicyArticle.find_one(PolicyArticle.url == item["url"])
        if existing_article is not None:
            skipped_count += 1
            continue

        candidate_items.append(item)

    scrape_results = await _scrape_candidates(candidate_items)
    for result in scrape_results:
        if result.error is not None:
            failed_articles.append(_build_failed_article(result.item, result.error))
            continue
        if result.raw_content is None:
            continue
        if len(processed_articles) >= max_new_articles:
            continue

        article_response = await _insert_scraped_article(
            result.item,
            result.raw_content,
            current_session_id,
        )
        if article_response is not None:
            processed_articles.append(article_response)

    return SyncAttemptResult(
        candidate_count=len(news_items),
        attempted_count=attempted_count,
        processed_articles=processed_articles,
        skipped_count=skipped_count,
        failed_articles=failed_articles,
    )


async def _scrape_candidates(items: list[dict[str, Any]]) -> list[ScrapeResult]:
    semaphore = asyncio.Semaphore(MAX_SCRAPE_CONCURRENCY)

    async def scrape_item(item: dict[str, Any]) -> ScrapeResult:
        async with semaphore:
            try:
                raw_content = await asyncio.wait_for(
                    scrape_article_content(item["url"]),
                    timeout=ARTICLE_SCRAPE_TIMEOUT_SECONDS,
                )
                return ScrapeResult(item=item, raw_content=raw_content)
            except (FullTextFetchFailed, TimeoutError) as error:
                return ScrapeResult(item=item, error=error)

    return await asyncio.gather(*(scrape_item(item) for item in items))


async def _insert_scraped_article(
    item: dict[str, Any],
    raw_content: str,
    session_id: str,
) -> ArticleResponse | None:
    if await PolicyArticle.find_one(PolicyArticle.url == item["url"]) is not None:
        return None

    article = PolicyArticle(
        title=item["title"],
        source=item["source"],
        publish_date=item["publish_date"],
        raw_content=raw_content,
        url=item["url"],
        status="pending",
        session_id=session_id,
    )

    try:
        await article.insert()
    except Exception:
        logger.exception("Failed to insert synced article: %s", item["url"])
        return None

    analysis = _build_pending_analysis(item, raw_content)
    interpretation = AIInterpretation(
        article_id=article,
        core_summary=analysis["core_summary"],
        banker_perspective=analysis["banker_perspective"],
        public_perspective=analysis["public_perspective"],
        impact_score=analysis["impact_score"],
        keywords=analysis["keywords"],
    )
    await interpretation.insert()

    return await serialize_article(article, interpretation)


def _build_failed_article(
    item: dict[str, Any],
    error: Exception,
) -> dict[str, str]:
    logger.warning("Skipped article because content scraping failed: %s", error)
    return {
        "title": item["title"],
        "url": item["url"],
        "reason": str(error) or error.__class__.__name__,
    }


def _merge_sync_attempts(
    primary: SyncAttemptResult,
    fallback: SyncAttemptResult,
) -> SyncAttemptResult:
    return SyncAttemptResult(
        candidate_count=primary.candidate_count + fallback.candidate_count,
        attempted_count=primary.attempted_count + fallback.attempted_count,
        processed_articles=[*primary.processed_articles, *fallback.processed_articles],
        failed_articles=[*primary.failed_articles, *fallback.failed_articles],
        skipped_count=primary.skipped_count + fallback.skipped_count,
    )


def _primary_since_boundary() -> datetime:
    now = datetime.now(LOCAL_TIMEZONE)
    return (now - timedelta(days=1)).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )


def _fallback_since_boundary() -> datetime:
    now = datetime.now(LOCAL_TIMEZONE)
    return (now - timedelta(days=MAX_LOOKBACK_DAYS)).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )


def _build_pending_analysis(item: dict[str, Any], raw_content: str) -> dict[str, Any]:
    title = str(item.get("title") or "").strip()
    summary = title if len(title) <= 36 else f"{title[:36]}..."
    keywords = _extract_keywords(f"{title} {raw_content}")

    return {
        "core_summary": summary or "已获取最新政策资讯，等待 AI 解析。",
        "banker_perspective": "尚未解析。进入详情页后点击 AI 解析按钮生成专业视角。",
        "public_perspective": "尚未解析。进入详情页后点击 AI 解析按钮生成大众建议。",
        "impact_score": 0,
        "keywords": keywords,
    }


def _extract_keywords(text: str) -> list[str]:
    candidates = [
        "央行",
        "货币政策",
        "金融统计",
        "银行",
        "利率",
        "贷款",
        "存款",
        "资本市场",
        "证券",
        "债券",
        "基金",
        "外汇",
        "汇率",
        "商务部",
        "进出口",
        "贸易",
        "消费",
        "油价",
        "房地产",
        "监管",
        "财政",
    ]
    keywords = [keyword for keyword in candidates if keyword in text]
    return keywords[:5] or ["金融政策"]
