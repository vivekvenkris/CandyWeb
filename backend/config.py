from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """
    Application settings

    Can be configured via environment variables or .env file
    """

    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Data directories
    # This is the root directory on the server where candidate data is stored
    # Each subdirectory should contain a candidates.csv file
    SERVER_DATA_ROOT: str = "/data/pulsar_surveys"

    # Alternative: Allow multiple data roots
    # SERVER_DATA_ROOTS: list[str] = ["/data/pulsar_surveys", "/data/archive"]

    # CORS settings
    CORS_ORIGINS: list[str] = ["*"]  # In production, specify frontend URL

    # Auto-save interval (minutes)
    AUTOSAVE_INTERVAL: int = 2

    # Max candidates to return in one request (pagination)
    MAX_CANDIDATES_PER_REQUEST: int = 10000

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
