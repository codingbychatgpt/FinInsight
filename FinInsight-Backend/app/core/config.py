from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:10086,"
    "http://localhost:10086,"
    "https://52zzx.top,"
    "https://www.52zzx.top"
)


class Settings(BaseSettings):
    mongo_uri: str
    mongo_db_name: str = "fininsight"
    environment: str = "development"
    openai_api_key: str = ""
    openai_base_url: str | None = None
    openai_model: str = "gpt-4o-mini"
    cors_origins: str = DEFAULT_CORS_ORIGINS
    request_log_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
