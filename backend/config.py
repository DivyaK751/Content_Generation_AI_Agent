from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    GOOGLE_OAUTH_CLIENT_SECRET_FILE: str = "credentials/client_secret.json"
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080  # 7 days
    GCP_PROJECT_ID: str = "agentic-ai-dk3480"
    BQ_DATASET_USERS: str = "social_content_agent"
    GCS_BUCKET_NAME: str = "social-content-agent-assets"
    FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()
