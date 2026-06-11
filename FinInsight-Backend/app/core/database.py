import inspect

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import AsyncMongoClient

from app.core.config import get_settings
from app.models.article import AIInterpretation, PolicyArticle
from app.models.user import User, UserSession

client: AsyncIOMotorClient | AsyncMongoClient | None = None


async def init_db() -> None:
    global client

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    database = client[settings.mongo_db_name]

    try:
        await init_beanie(
            database=database,
            document_models=[
                PolicyArticle,
                AIInterpretation,
                User,
                UserSession,
            ],
        )
    except TypeError as error:
        if "append_metadata" not in str(error):
            raise

        client = AsyncMongoClient(settings.mongo_uri)
        database = client[settings.mongo_db_name]
        await init_beanie(
            database=database,
            document_models=[
                PolicyArticle,
                AIInterpretation,
                User,
                UserSession,
            ],
        )


async def ping_db() -> bool:
    if client is None:
        return False

    try:
        await client.admin.command("ping")
        return True
    except Exception:
        return False


async def close_db() -> None:
    global client

    if client is not None:
        close_result = client.close()
        if inspect.isawaitable(close_result):
            await close_result
        client = None
