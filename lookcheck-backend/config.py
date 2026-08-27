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

# --- Image pipeline --------------------------------------------------------

# Every wardrobe tile is written at this size, square.
IMAGE_SIZE = _int("IMAGE_SIZE", 800)

# Padding around the garment, as a share of its own longest edge. Proportional
# rather than fixed so a coat and a sock end up looking equally "shelved".
IMAGE_PADDING_RATIO = float(_str("IMAGE_PADDING_RATIO", "0.08"))

# Tile ground. White, the way a catalogue photographs a garment - and the way
# most shop packshots already arrive, so linked items need no alteration.
IMAGE_BACKGROUND = (255, 255, 255, 255)

# Background removal is off by default: shop packshots are already clean, and
# cutting out a garment worn by a person is the part this pipeline does least
# reliably. Set REMOVE_BACKGROUND=1 to enable it for camera photos.
REMOVE_BACKGROUND = _str("REMOVE_BACKGROUND", "0") not in ("0", "false", "no")

# How many product photos to consider from a page before choosing the one
# showing the garment on its own.
MAX_PRODUCT_IMAGES = _int("MAX_PRODUCT_IMAGES", 6)

# Produce a transparent cut-out alongside every tile. This is what makes an
# outfit composable - garments can only be laid over one another convincingly
# if each has been separated from its background. Independent of
# REMOVE_BACKGROUND, which only governs the tile shown on a wardrobe card.
MAKE_CUTOUTS = _str("MAKE_CUTOUTS", "1") not in ("0", "false", "no")

# u2netp is the small variant: 4.5MB, ~2s on CPU. "u2net" is more accurate
# and roughly 40x larger.
SEGMENTATION_MODEL = _str("SEGMENTATION_MODEL", "u2netp")

# Uploads below this on either side are rejected outright.
MIN_SOURCE_PX = _int("MIN_SOURCE_PX", 200)

# Reject when the extracted garment covers less than this share of the tile.
MIN_SUBJECT_COVERAGE = float(_str("MIN_SUBJECT_COVERAGE", "0.04"))

# Where processed tiles are written.
MEDIA_ROOT = _str("MEDIA_ROOT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "media"))

# Max garments offered from a single photo.
MAX_DETECTED_ITEMS = _int("MAX_DETECTED_ITEMS", 4)

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
