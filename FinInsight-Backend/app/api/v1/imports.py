from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.articles import serialize_article
from app.core.auth import require_user
from app.models.article import PolicyArticle
from app.models.user import User
from app.schemas.imports import (
    ConfirmImportRequest,
    ConfirmImportResponse,
    ImportPreviewRequest,
    ImportPreviewResponse,
    WebSearchRequest,
    WebSearchResponse,
)
from app.services.imports import (
    ImportFetchFailed,
    UnsafeImportUrl,
    fetch_import_preview,
    search_web,
    validate_public_url,
)

router = APIRouter(tags=["imports"], dependencies=[Depends(require_user)])


@router.post("/imports/preview", response_model=ImportPreviewResponse)
async def preview_import(payload: ImportPreviewRequest) -> ImportPreviewResponse:
    try:
        normalized = await validate_public_url(str(payload.url))
        existing = await PolicyArticle.find_one(PolicyArticle.url == normalized)
        if existing is not None:
            return ImportPreviewResponse(
                existing_article_id=str(existing.id),
                url=existing.url,
                title=existing.title,
                source=existing.source,
                publish_date=existing.publish_date,
                raw_content=existing.raw_content,
            )
        return ImportPreviewResponse(**await fetch_import_preview(normalized))
    except (UnsafeImportUrl, ImportFetchFailed) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/imports/confirm", response_model=ConfirmImportResponse)
async def confirm_import(
    payload: ConfirmImportRequest,
    user: User = Depends(require_user),
) -> ConfirmImportResponse:
    try:
        normalized = await validate_public_url(str(payload.url))
    except UnsafeImportUrl as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    existing = await PolicyArticle.find_one(PolicyArticle.url == normalized)
    if existing is not None:
        return ConfirmImportResponse(article=await serialize_article(existing), created=False)

    article = PolicyArticle(
        title=payload.title.strip(),
        source=payload.source.strip(),
        publish_date=payload.publish_date,
        raw_content=payload.raw_content.strip(),
        url=normalized,
        status="pending",
        ingestion_method=payload.ingestion_method,
        imported_by=str(user.id),
    )
    await article.insert()
    return ConfirmImportResponse(article=await serialize_article(article), created=True)


@router.post("/search", response_model=WebSearchResponse)
async def web_search(payload: WebSearchRequest) -> WebSearchResponse:
    try:
        return WebSearchResponse(results=await search_web(payload.query.strip()))
    except Exception as error:
        raise HTTPException(status_code=502, detail="网络搜索暂不可用") from error
