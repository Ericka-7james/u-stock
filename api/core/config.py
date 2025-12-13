import os
from pydantic import BaseModel

class Settings(BaseModel):
    env: str = os.getenv("ENV", "development")
    database_url: str = os.getenv("DATABASE_URL", "")

    cors_origins: list[str] = os.getenv(
        "USTOCK_CORS_ORIGINS",
        "http://localhost:5173,https://u-stock.vercel.app",
    ).split(",")

    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")

settings = Settings()
