"""
Central configuration for the LookCheck AI backend.

Every setting comes from an environment variable with a safe default, so the
app boots with an empty .env file. Anything that must not have a default in
production (the JWT secret) is validated in `validate()`, which is called at
startup.
"""

import os
import secrets

from dotenv import load_dotenv

load_dotenv()


def _str(name, default=""):
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else default


def _int(name, default):
    try:
        return int(_str(name, str(default)))
    except ValueError:
        return default


class ConfigError(RuntimeError):
    pass


# --- Runtime ---------------------------------------------------------------

APP_ENV = _str("APP_ENV", "development").lower()
IS_PRODUCTION = APP_ENV == "production"
PORT = _int("PORT", 8000)

# --- Auth ------------------------------------------------------------------

# In development we fall back to an ephemeral secret so the app just runs.
# Tokens are invalidated on every restart, which is fine locally.
JWT_SECRET = _str("JWT_SECRET") or secrets.token_hex(32)
JWT_SECRET_IS_EPHEMERAL = not _str("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = _int("JWT_EXPIRY_DAYS", 30)

MIN_PASSWORD_LENGTH = 8

# --- Database --------------------------------------------------------------

DATABASE_URL = _str("DATABASE_URL", "sqlite:///lookcheck.db")

# --- AI --------------------------------------------------------------------

GEMINI_API_KEY = _str("GEMINI_API_KEY")
GEMINI_MODEL = _str("GEMINI_MODEL", "gemini-2.5-flash")

ANTHROPIC_API_KEY = _str("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = _str("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")


def _resolve_ai_provider():
    explicit = _str("AI_PROVIDER").lower()
    if explicit in ("mock", "gemini", "anthropic"):
        return explicit
    if GEMINI_API_KEY:
        return "gemini"
    if ANTHROPIC_API_KEY:
        return "anthropic"
    return "mock"


AI_PROVIDER = _resolve_ai_provider()

# --- Weather ---------------------------------------------------------------

OPENWEATHER_API_KEY = _str("OPENWEATHER_API_KEY")
WEATHER_PROVIDER = _str("WEATHER_PROVIDER", "open-meteo").lower()
if WEATHER_PROVIDER == "openweather" and not OPENWEATHER_API_KEY:
    # Silently degrade instead of breaking the app.
    WEATHER_PROVIDER = "open-meteo"

WEATHER_CACHE_TTL_SECONDS = 15 * 60

# --- Limits ----------------------------------------------------------------

MAX_OUTFITS_PER_DAY = _int("MAX_OUTFITS_PER_DAY", 10)
MAX_ANALYSIS_PER_HOUR = _int("MAX_ANALYSIS_PER_HOUR", 20)
MAX_WARDROBE_ITEMS = _int("MAX_WARDROBE_ITEMS", 300)
MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 8)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Outbound HTTP timeouts (seconds)
AI_TIMEOUT = 45
WEATHER_TIMEOUT = 10
PAGE_FETCH_TIMEOUT = 10

# Max bytes read from a product page before handing it to the model
MAX_PAGE_BYTES = 300_000
MAX_PAGE_CHARS = 6000

# Max bytes read from a product image before handing it to the vision model
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# --- CORS ------------------------------------------------------------------

CORS_ORIGINS = [o.strip() for o in _str("CORS_ORIGINS", "*").split(",") if o.strip()]


def validate():
    """Fail fast on misconfiguration. Called once at startup."""
    if IS_PRODUCTION and JWT_SECRET_IS_EPHEMERAL:
        raise ConfigError(
            "JWT_SECRET must be set when APP_ENV=production. "
            'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
        )
    if IS_PRODUCTION and DATABASE_URL.startswith("sqlite"):
        # Not fatal, but almost always a mistake: most free hosts have an
        # ephemeral filesystem, so a SQLite file is wiped on every deploy.
        print(
            "[config] WARNING: running in production on SQLite. "
            "User data will be lost on redeploy. Set DATABASE_URL to Postgres."
        )


def summary():
    """Non-secret snapshot of the active configuration, exposed via /api/health."""
    return {
        "env": APP_ENV,
        "database": "postgres" if not DATABASE_URL.startswith("sqlite") else "sqlite",
        "ai_provider": AI_PROVIDER,
        "weather_provider": WEATHER_PROVIDER,
    }
