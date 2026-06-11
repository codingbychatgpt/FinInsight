import asyncio
import ipaddress
import re
import socket
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import feedparser
import httpx
from bs4 import BeautifulSoup

from app.services.crawler import _clean_article_text, _decode_response_text, _is_noise_paragraph

MAX_REDIRECTS = 5
MAX_DOWNLOAD_BYTES = 4_000_000
REQUEST_TIMEOUT_SECONDS = 20


class UnsafeImportUrl(ValueError):
    pass


class ImportFetchFailed(ValueError):
    pass


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise UnsafeImportUrl("仅支持有效的 http/https 网页地址")
    query = parse_qs(parsed.query, keep_blank_values=True)
    clean_query = {
        key: values
        for key, values in query.items()
        if not key.lower().startswith(("utm_", "spm", "from", "source"))
    }
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path or "/",
            "",
            urlencode(clean_query, doseq=True),
            "",
        )
    )


async def validate_public_url(url: str) -> str:
    normalized = normalize_url(url)
    hostname = urlparse(normalized).hostname
    if hostname is None or hostname.lower() == "localhost":
        raise UnsafeImportUrl("禁止访问本机或内网地址")

    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
    except socket.gaierror as error:
        raise UnsafeImportUrl("无法解析该网址") from error

    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise UnsafeImportUrl("禁止访问本机、内网或保留地址")
    return normalized


async def fetch_import_preview(url: str) -> dict[str, str | datetime]:
    current_url = await validate_public_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; FinInsight/1.0)",
        "Accept": "text/html,application/xhtml+xml",
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS, headers=headers, trust_env=False) as client:
        try:
            for _ in range(MAX_REDIRECTS + 1):
                response = await client.get(current_url, follow_redirects=False)
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise ImportFetchFailed("网页重定向缺少目标地址")
                    current_url = await validate_public_url(urljoin(current_url, location))
                    continue
                response.raise_for_status()
                if len(response.content) > MAX_DOWNLOAD_BYTES:
                    raise ImportFetchFailed("网页内容过大，无法导入")
                break
            else:
                raise ImportFetchFailed("网页重定向次数过多")
        except httpx.HTTPError as error:
            raise ImportFetchFailed("无法抓取该网页，请检查地址或稍后重试") from error

    content_type = response.headers.get("content-type", "").lower()
    if "html" not in content_type and "text/" not in content_type:
        raise ImportFetchFailed("该地址不是可导入的网页")

    soup = BeautifulSoup(_decode_response_text(response), "html.parser")
    title = _first_meta(soup, "property", "og:title") or _first_meta(soup, "name", "title")
    if not title and soup.title:
        title = soup.title.get_text(" ", strip=True)
    source = _first_meta(soup, "property", "og:site_name") or urlparse(current_url).hostname or "手动导入"
    publish_date = _extract_publish_date(soup) or datetime.now(timezone.utc)
    raw_content = _extract_content(soup)
    if len(raw_content) < 100:
        raise ImportFetchFailed("未能提取足够的正文内容")

    return {
        "url": normalize_url(current_url),
        "title": _clean_article_text(title or "未命名资讯")[:500],
        "source": _clean_article_text(source)[:200],
        "publish_date": publish_date,
        "raw_content": raw_content[:300_000],
    }


async def search_web(query: str) -> list[dict[str, str]]:
    search_url = (
        "https://www.bing.com/search?"
        f"{httpx.QueryParams({'format': 'rss', 'q': query, 'setlang': 'zh-Hans', 'cc': 'CN'})}"
    )
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"User-Agent": "Mozilla/5.0 (compatible; FinInsight/1.0)"},
        trust_env=False,
    ) as client:
        response = await client.get(search_url)
        response.raise_for_status()

    feed = feedparser.parse(response.content)
    results: list[dict[str, str]] = []
    for entry in feed.entries[:10]:
        link = str(entry.get("link", "")).strip()
        if not link:
            continue
        results.append(
            {
                "title": _clean_article_text(str(entry.get("title", ""))),
                "url": link,
                "summary": _clean_article_text(BeautifulSoup(str(entry.get("summary", "")), "html.parser").get_text(" ")),
                "publish_date": str(entry.get("published", "")),
            }
        )
    return results


def _first_meta(soup: BeautifulSoup, attribute: str, value: str) -> str:
    tag = soup.find("meta", attrs={attribute: value})
    return str(tag.get("content", "")).strip() if tag else ""


def _extract_publish_date(soup: BeautifulSoup) -> datetime | None:
    candidates = [
        ("property", "article:published_time"),
        ("name", "pubdate"),
        ("name", "publishdate"),
        ("name", "date"),
        ("itemprop", "datePublished"),
    ]
    for attribute, value in candidates:
        raw = _first_meta(soup, attribute, value)
        if raw:
            try:
                parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    match = re.search(r"(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})", soup.get_text(" ", strip=True)[:5000])
    if match:
        return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)), tzinfo=timezone.utc)
    return None


def _extract_content(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "iframe", "video", "nav", "footer", "aside"]):
        tag.decompose()
    container = soup.find("article") or soup.find("main") or soup.body or soup
    paragraphs = [
        _clean_article_text(node.get_text(" ", strip=True))
        for node in container.find_all(["p", "h2", "h3", "li"])
    ]
    paragraphs = [text for text in paragraphs if len(text) >= 12 and not _is_noise_paragraph(text)]
    return "\n".join(dict.fromkeys(paragraphs))
