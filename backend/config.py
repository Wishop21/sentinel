"""
SENTINEL — Central configuration
Loads from .env file. All other modules import from here.
backend/config.py
"""

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # OpenSky (OAuth2 client credentials)
    opensky_client_id: str = ""
    opensky_client_secret: str = ""

    # AISstream
    aisstream_api_key: str = ""

    # Storage
    data_dir: Path = Path("./data")
    metrics_db: Path = Path("./data/metrics/sentinel.db")
    raw_retention_days: int = 31

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def raw_aircraft_dir(self) -> Path:
        return self.data_dir / "raw" / "aircraft"

    @property
    def raw_vessels_dir(self) -> Path:
        return self.data_dir / "raw" / "vessels"

    @property
    def raw_satellites_dir(self) -> Path:
        return self.data_dir / "raw" / "satellites"

    def ensure_dirs(self):
        """Create all required directories if they don't exist."""
        for path in [
            self.raw_aircraft_dir,
            self.raw_vessels_dir,
            self.raw_satellites_dir,
            self.metrics_db.parent,
        ]:
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()
