import logging
from typing import Any

from fastapi import APIRouter

from app.models.article import AIInterpretation, PolicyArticle
from app.schemas.article import SyncArticleResponse, SyncResponse
from app.services.crawler import FullTextFetchFailed, fetch_latest_news, scrape_article_content

router = APIRouter(tags=["sync"])
logger = logging.getLogger(__name__)
MAX_ARTICLES_PER_SYNC = 15
MIN_STORED_CONTENT_LENGTH = 300


@router.post("/sync", response_model=SyncResponse)
async def sync_latest_news() -> SyncResponse:
    news_items = await fetch_latest_news()
    selected_items = news_items[:MAX_ARTICLES_PER_SYNC]
    processed_articles: list[SyncArticleResponse] = []
    failed_articles: list[dict[str, str]] = []
    skipped_count = 0

    for item in selected_items:
        existing_article = await PolicyArticle.find_one(PolicyArticle.url == item["url"])
        if existing_article is not None:
            if _needs_content_refresh(existing_article.raw_content):
                await _refresh_article_content(existing_article, item, failed_articles)
            skipped_count += 1
            continue

        try:
            raw_content = await scrape_article_content(item["url"])
        except FullTextFetchFailed as error:
            _record_failed_article(item, error, failed_articles)
            continue

        article = await _insert_parsed_article(item, raw_content)
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

        processed_articles.append(
            SyncArticleResponse(
                article_id=str(article.id),
                title=article.title,
                url=article.url,
                source=article.source,
                impact_score=interpretation.impact_score,
                keywords=interpretation.keywords,
            ),
        )

    return SyncResponse(
        candidate_count=len(news_items),
        attempted_count=len(selected_items),
        processed_count=len(processed_articles),
        skipped_count=skipped_count,
        failed_count=len(failed_articles),
        articles=processed_articles,
        failed_articles=failed_articles,
    )


def _needs_content_refresh(raw_content: str) -> bool:
    paragraphs = [paragraph for paragraph in raw_content.splitlines() if paragraph.strip()]
    return len(raw_content) < MIN_STORED_CONTENT_LENGTH or len(paragraphs) < 2


async def _refresh_article_content(
    article: PolicyArticle,
    item: dict[str, Any],
    failed_articles: list[dict[str, str]],
) -> None:
    try:
        article.raw_content = await scrape_article_content(item["url"])
        await article.save()
    except FullTextFetchFailed as error:
        _record_failed_article(item, error, failed_articles)


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


def _record_failed_article(
    item: dict[str, Any],
    error: FullTextFetchFailed,
    failed_articles: list[dict[str, str]],
) -> None:
    logger.warning("Skipped article because content scraping failed: %s", error)
    failed_articles.append(
        {
            "title": item["title"],
            "url": item["url"],
            "reason": str(error),
        },
    )


async def _insert_parsed_article(
    item: dict[str, Any],
    raw_content: str,
) -> PolicyArticle:
    article = PolicyArticle(
        title=item["title"],
        source=item["source"],
        publish_date=item["publish_date"],
        raw_content=raw_content,
        url=item["url"],
        status="pending",
    )
    await article.insert()
    return article
