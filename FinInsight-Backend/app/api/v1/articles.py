from fastapi import APIRouter, HTTPException, Query

from app.models.article import AIInterpretation, PolicyArticle
from app.schemas.article import (
    AIInterpretationResponse,
    ArticleListResponse,
    ArticleResponse,
)
from app.services.llm_parser import analyze_policy_text

router = APIRouter(tags=["articles"])


@router.get("/articles", response_model=ArticleListResponse)
async def get_articles(
    limit: int = Query(default=15, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> ArticleListResponse:
    articles = (
        await PolicyArticle.find_all()
        .sort(-PolicyArticle.publish_date)
        .skip(offset)
        .limit(limit)
        .to_list()
    )

    results = [await serialize_article(article) for article in articles]
    return ArticleListResponse(articles=results)


@router.post("/articles/{article_id}/analyze", response_model=ArticleResponse)
async def analyze_article(article_id: str) -> ArticleResponse:
    article = await PolicyArticle.get(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    interpretation = await AIInterpretation.find_one(
        AIInterpretation.article_id.id == article.id,
    )
    if interpretation is None:
        interpretation = AIInterpretation(
            article_id=article,
            core_summary="",
            banker_perspective="",
            public_perspective="",
            impact_score=0,
            keywords=[],
        )

    analysis = await analyze_policy_text(article.raw_content)
    interpretation.core_summary = analysis["core_summary"]
    interpretation.banker_perspective = analysis["banker_perspective"]
    interpretation.public_perspective = analysis["public_perspective"]
    interpretation.impact_score = analysis["impact_score"]
    interpretation.keywords = analysis["keywords"]

    if interpretation.id is None:
        await interpretation.insert()
    else:
        await interpretation.save()

    article.status = "parsed"
    await article.save()

    return await serialize_article(article, interpretation)


async def serialize_article(
    article: PolicyArticle,
    interpretation: AIInterpretation | None = None,
) -> ArticleResponse:
    if interpretation is None:
        interpretation = await AIInterpretation.find_one(
            AIInterpretation.article_id.id == article.id,
            fetch_links=True,
        )

    interpretation_response = (
        AIInterpretationResponse(
            id=str(interpretation.id),
            core_summary=interpretation.core_summary,
            banker_perspective=interpretation.banker_perspective,
            public_perspective=interpretation.public_perspective,
            impact_score=interpretation.impact_score,
            keywords=interpretation.keywords,
        )
        if interpretation is not None
        else AIInterpretationResponse(
            core_summary="已获取资讯，等待 AI 解析。",
            banker_perspective="尚未解析。",
            public_perspective="尚未解析。",
            impact_score=0,
            keywords=[],
        )
    )

    return ArticleResponse(
        id=str(article.id),
        title=article.title,
        source=article.source,
        publish_date=article.publish_date,
        raw_content=article.raw_content,
        url=article.url,
        status=article.status,
        interpretation=interpretation_response,
    )
