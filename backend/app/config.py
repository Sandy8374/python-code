from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Python Mastery API"
    database_url: str = "sqlite:///./python_mastery.db"
    jwt_secret: str = "local-python-mastery-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 30
    max_source_bytes: int = 65536
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"

    class Config:
        env_file = ".env"


settings = Settings()
