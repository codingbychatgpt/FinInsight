import asyncio
import json
import logging
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)
LLM_TIMEOUT_SECONDS = 30.0


def _default_error_result() -> dict[str, Any]:
    return {
        "core_summary": "解析失败",
        "banker_perspective": "大模型解析暂不可用，请稍后重试或检查 API 配置。",
        "public_perspective": "暂时无法生成建议，请等待系统恢复后再查看。",
        "impact_score": 1,
        "keywords": ["解析失败"],
    }


def _get_openai_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")

    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        timeout=LLM_TIMEOUT_SECONDS,
    )


async def analyze_policy_text(text: str) -> dict[str, Any]:
    prompt = (
        "你是一位资深的银行理财经理与宏观经济研究员。请阅读以下金融政策文本：\n"
        f"{text}\n"
        "请输出严格的 JSON 格式，包含以下字段：\n"
        "1. core_summary (核心结论，200-500个中文字符，说明政策或事件的背景、核心变化、直接影响和需要关注的风险点)\n"
        "2. banker_perspective (银行同业视角，200-500个中文字符，分析对银行业务、资产负债、流动性、信贷投放、财富管理、同业业务或市场风险的影响，并给出可执行关注点)\n"
        "3. public_perspective (大众视角，200-500个中文字符，用普通人能理解的话说明对消费、储蓄、贷款、理财、投资或生活成本的影响，并给出谨慎可操作的建议)\n"
        "4. impact_score (1-10分的数字打分)\n"
        "5. keywords (提取3-5个核心关键词的字符串数组)\n"
        "要求：不要只写一两句空泛结论；core_summary、banker_perspective 和 public_perspective 都必须信息充足、结构清晰、控制在200-500个中文字符；"
        "不要输出 Markdown，不要在 JSON 外输出任何解释文字。"
    )

    try:
        settings = get_settings()
        client = _get_openai_client()
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {
                        "role": "system",
                        "content": "你只输出可被 json.loads 解析的 JSON 对象，所有中文长文本字段严格控制在200-500个中文字符。",
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                response_format={"type": "json_object"},
                max_tokens=1800,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )

        content = response.choices[0].message.content
        if not content:
            return _default_error_result()

        result = json.loads(content)
        return {
            "core_summary": str(result.get("core_summary", "解析失败")),
            "banker_perspective": str(result.get("banker_perspective", "")),
            "public_perspective": str(result.get("public_perspective", "")),
            "impact_score": int(result.get("impact_score", 1)),
            "keywords": list(result.get("keywords", ["解析失败"])),
        }
    except Exception:
        logger.exception("Failed to analyze policy text with LLM")
        return _default_error_result()
