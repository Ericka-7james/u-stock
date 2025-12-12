import os
from pydantic import BaseModel

class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "")
    jwt_secret: str = os.getenv("USTOCK_JWT_SECRET", "")
    jwt_alg: str = os.getenv("USTOCK_JWT_ALG", "HS256")
    cors_origins: list[str] = os.getenv(
        "USTOCK_CORS_ORIGINS",
        "https://u-stock.vercel.app"
    ).split(",")

settings = Settings()
