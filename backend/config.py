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

    # Enable neighbor beam calculation
    # Set to False to skip neighbor calculation and speed up metafile loading
    CALCULATE_NEIGHBORS: bool = False

    # Number of CPU cores to use for neighbor beam calculation (if enabled)
    # Set to 0 to use all available cores, or specify 1-N cores
    NEIGHBOR_CALC_CORES: int = 8

    # Pulsar scraper database search parameters
    PULSAR_SCRAPER_RADIUS: float = 5.0  # Search radius in degrees
    PULSAR_SCRAPER_DM_TOL: float = 10.0  # DM tolerance in pc/cc

    # PSRCAT database path and search radius
    PSRCAT_DB_PATH: str = "psrcat.db"
    PSRCAT_SEARCH_RADIUS_DEG: float = 2.0  # Search radius in degrees for PSRCAT matching

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
