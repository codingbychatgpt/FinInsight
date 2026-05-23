import asyncio
import logging
import re
from calendar import timegm
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urldefrag, urljoin

import feedparser
import httpx
from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)
LOCAL_TIMEZONE = timezone(timedelta(hours=8))

@dataclass(frozen=True)
class RSSSource:
    url: str
    source_name: str
    filter_by_keywords: bool = True
    base_url: str | None = None


RSS_SOURCES = [
    RSSSource(
        url="https://rss.sina.com.cn/news/china/focus15.xml",
        source_name="新浪国内要闻",
    ),
    RSSSource(
        url="https://rss.sina.com.cn/finance/stock/left7.xml",
        source_name="新浪证券金融",
    ),
    RSSSource(
        url="https://www.chinanews.com.cn/rss/finance.xml",
        source_name="中新网财经",
    ),
]
MAX_ITEMS_PER_SOURCE = 20
MAX_CANDIDATE_ITEMS = 15
MIN_FULL_TEXT_LENGTH = 150
MIN_FULL_CONTENT_LENGTH = 300
MIN_PARAGRAPH_LENGTH = 30

ARTICLE_CONTAINER_SELECTORS = [
    "#artibody",
    ".article",
    "#main-content",
    ".text-content",
    ".article-content",
    "article",
    "#zoom",
    ".left_zw",
    ".article_body",
    ".TRS_Editor",
    ".main-content",
    ".content",
    "#content",
]

FINANCE_POLICY_KEYWORDS = (
    "政策",
    "宏观",
    "金融",
    "财经",
    "经济",
    "央行",
    "货币",
    "利率",
    "lpr",
    "银行",
    "证券",
    "证监",
    "股市",
    "股票",
    "债券",
    "基金",
    "外汇",
    "汇率",
    "房地产",
    "消费",
    "理财",
    "投资",
    "财政",
    "税",
    "价格",
    "油价",
    "监管",
    "融资",
    "贷款",
    "存款",
    "资本市场",
    "国债",
    "金融监管",
    "保险",
    "信托",
    "商务",
    "海关",
    "进出口",
    "贸易",
    "成品油",
    "补贴",
    "奖补",
)

EXCLUDED_KEYWORDS = (
    "娱乐",
    "八卦",
    "明星",
    "综艺",
    "影视",
    "体育",
    "彩票",
    "游戏",
    "星座",
)

NOISE_PATTERNS = (
    r"分享到微信.*",
    r"分享到微博.*",
    r"责任编辑[:：].*",
    r"责编[:：].*",
    r"编辑[:：].*",
    r"来源[:：]\s*$",
    r"免责声明.*",
    r"特别声明.*",
    r"更多精彩.*",
    r"扫描二维码.*",
    r"关注.*公众号.*",
    r"客户端.*",
    r"下载.*APP.*",
    r"版权.*所有.*",
)

AD_KEYWORDS = (
    "分享到",
    "责任编辑",
    "责编",
    "广告",
    "二维码",
    "客户端",
    "app下载",
    "点击进入",
    "我要反馈",
    "相关阅读",
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
}


class FullTextFetchFailed(RuntimeError):
    pass


def _parse_publish_date(entry: Any) -> datetime:
    published_parsed = getattr(entry, "published_parsed", None)
    if published_parsed:
        return datetime.fromtimestamp(timegm(published_parsed), tz=UTC)

    updated_parsed = getattr(entry, "updated_parsed", None)
    if updated_parsed:
        return datetime.fromtimestamp(timegm(updated_parsed), tz=UTC)

    return datetime.now(UTC)


def _clean_text(text: str) -> str:
    text = text.replace("\n", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", text).strip()


def _extract_entry_content(entry: Any) -> str:
    html_parts: list[str] = []

    for content_item in getattr(entry, "content", []) or []:
        value = getattr(content_item, "value", "")
        if value:
            html_parts.append(value)

    summary = getattr(entry, "summary", "")
    if summary:
        html_parts.append(summary)

    if not html_parts:
        return ""

    soup = BeautifulSoup(" ".join(html_parts), "html.parser")
    return _clean_text(soup.get_text(" ", strip=True))


async def fetch_latest_news() -> list[dict[str, Any]]:
    now = datetime.now(LOCAL_TIMEZONE)
    yesterday_midnight = (now - timedelta(days=1)).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    async with httpx.AsyncClient(
        headers=HEADERS,
        timeout=10.0,
        follow_redirects=True,
        trust_env=False,
    ) as client:
        source_results = await _fetch_sources(client)

    news_items = [
        item
        for source_items in source_results.values()
        for item in source_items
        if _to_local_datetime(item["publish_date"]) >= yesterday_midnight
    ]
    news_items.sort(key=lambda item: item["publish_date"], reverse=True)
    return _dedupe_news_items(news_items)[:MAX_CANDIDATE_ITEMS]


async def _fetch_sources(
    client: httpx.AsyncClient,
) -> dict[str, list[dict[str, Any]]]:
    source_results: dict[str, list[dict[str, Any]]] = {}

    results = await asyncio.gather(
        *(_fetch_source(client, source) for source in RSS_SOURCES),
    )
    for source_name, news_items in results:
        if news_items:
            source_results[source_name] = news_items

    return source_results


async def _fetch_source(
    client: httpx.AsyncClient,
    source: RSSSource,
) -> tuple[str, list[dict[str, Any]]]:
    try:
        response = await client.get(source.url)
        response.raise_for_status()

        feed = feedparser.parse(response.content)
        if getattr(feed, "bozo", False):
            logger.warning(
                "RSS feed parse warning for %s: %s",
                source.url,
                getattr(feed, "bozo_exception", "unknown"),
            )

        return source.source_name, _build_news_items(feed.entries, source)
    except Exception:
        logger.exception("Failed to fetch latest news from RSS: %s", source.url)
        return source.source_name, []


def _build_news_items(
    entries: list[Any],
    source: RSSSource,
) -> list[dict[str, Any]]:
    news_items: list[dict[str, Any]] = []

    for entry in entries[:MAX_ITEMS_PER_SOURCE]:
        title = _clean_text(getattr(entry, "title", ""))
        url = _normalize_url(getattr(entry, "link", ""), source.base_url or source.url)
        if not title or not url:
            continue

        rss_content = _extract_entry_content(entry)
        if source.filter_by_keywords and not _looks_relevant(title, rss_content):
            continue

        news_items.append(
            {
                "title": title,
                "url": url,
                "source": source.source_name,
                "publish_date": _parse_publish_date(entry),
                "rss_content": rss_content,
            },
        )

    return news_items


def _dedupe_news_items(news_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    deduped: list[dict[str, Any]] = []

    for item in news_items:
        url = urldefrag(item["url"])[0].rstrip("/")
        title_key = re.sub(r"\s+", "", item["title"])
        if url in seen_urls or title_key in seen_titles:
            continue
        seen_urls.add(url)
        seen_titles.add(title_key)
        deduped.append(item)

    return deduped


def _normalize_url(url: str, base_url: str) -> str:
    if not url:
        return ""
    if url.startswith("www."):
        return f"https://{url}"
    return urljoin(base_url, url)


def _to_local_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=LOCAL_TIMEZONE)
    return value.astimezone(LOCAL_TIMEZONE)


def _looks_relevant(title: str, content: str) -> bool:
    text = f"{title} {content}".lower()
    if any(keyword in text for keyword in EXCLUDED_KEYWORDS):
        return False
    return any(keyword in text for keyword in FINANCE_POLICY_KEYWORDS)


async def scrape_article_content(url: str) -> str:
    reader_error: Exception | None = None
    local_error: Exception | None = None

    try:
        content = await _fetch_with_reader_gateway(url)
        return _validate_full_text(content, url)
    except FullTextFetchFailed as error:
        reader_error = error
        logger.warning("Reader gateway did not return full text: %s", error)

    try:
        content = await _fetch_with_beautifulsoup(url)
        return _validate_full_text(content, url)
    except FullTextFetchFailed as error:
        local_error = error
        logger.warning("Local HTML parser did not return full text: %s", error)

    raise FullTextFetchFailed(
        f"Full text fetch failed, url={url}, reader_error={reader_error}, local_error={local_error}",
    )


async def _fetch_with_reader_gateway(url: str) -> str:
    reader_url = f"https://r.jina.ai/{url}"

    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=15.0,
            follow_redirects=True,
            trust_env=False,
        ) as client:
            response = await client.get(reader_url)
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise FullTextFetchFailed(f"Reader gateway request failed: {url}") from error

    return _clean_reader_text(response.text)


async def _fetch_with_beautifulsoup(url: str) -> str:
    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=10.0,
            follow_redirects=True,
            trust_env=False,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise FullTextFetchFailed(f"Failed to fetch article HTML: {url}") from error

    soup = BeautifulSoup(response.content, "html.parser")

    for tag in soup(["script", "style", "noscript", "iframe", "video", "aside", "nav", "footer"]):
        tag.decompose()

    container = _find_article_container(soup)
    paragraphs = _extract_clean_paragraphs(container) if container is not None else []

    if _is_incomplete_content(paragraphs):
        paragraphs = _extract_clean_paragraphs(soup.body or soup, fallback=True)

    return "\n".join(paragraphs)


def _validate_full_text(content: str, url: str) -> str:
    content = content.strip()
    if len(content) < MIN_FULL_TEXT_LENGTH:
        raise FullTextFetchFailed(
            f"Article full text too short, length={len(content)}, url={url}",
        )
    return content


def _clean_reader_text(text: str) -> str:
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if _is_noise_paragraph(line):
            continue
        lines.append(line)

    return "\n".join(_dedupe_paragraphs(lines))


def _find_article_container(soup: BeautifulSoup) -> Tag | None:
    for selector in ARTICLE_CONTAINER_SELECTORS:
        container = soup.select_one(selector)
        if isinstance(container, Tag):
            return container

    return None


def _is_incomplete_content(paragraphs: list[str]) -> bool:
    content = "\n".join(paragraphs)
    return len(paragraphs) < 2 or len(content) < MIN_FULL_CONTENT_LENGTH


def _extract_clean_paragraphs(
    container: Tag | BeautifulSoup,
    fallback: bool = False,
) -> list[str]:
    paragraphs: list[str] = []

    for paragraph in container.find_all("p"):
        text = _clean_article_text(paragraph.get_text(" ", strip=True))
        if not text:
            continue
        if fallback and len(text) < MIN_PARAGRAPH_LENGTH:
            continue
        if _is_noise_paragraph(text):
            continue
        paragraphs.append(text)

    return _dedupe_paragraphs(paragraphs)


def _clean_article_text(text: str) -> str:
    text = _clean_text(text)
    for pattern in NOISE_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
    return text


def _is_noise_paragraph(text: str) -> bool:
    compact_text = text.replace(" ", "").lower()
    return any(keyword.lower() in compact_text for keyword in AD_KEYWORDS)


def _dedupe_paragraphs(paragraphs: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []

    for paragraph in paragraphs:
        key = re.sub(r"\s+", "", paragraph)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(paragraph)

    return deduped
