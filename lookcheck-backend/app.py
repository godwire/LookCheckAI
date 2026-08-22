"""
LookCheck AI - backend REST API.

Every user-scoped route reads the account from the bearer token, never from
the URL. Outfit generation is cached per day so re-opening the app does not
silently produce a different look (or spend another AI call), and every
expensive endpoint is rate limited.

Run locally:
    pip install -r requirements.txt
    cp .env.example .env
    python app.py

With no API keys configured the app runs in demo mode: weather comes from
Open-Meteo (no key needed) and outfits are assembled by the deterministic
rule-based engine.
"""

import logging
from datetime import date
from functools import wraps

from flask import Flask, g, jsonify, request
from flask_cors import CORS

import auth
import config
import database
import security
from services import ai_service, weather_service

config.validate()

logging.basicConfig(
    level=logging.INFO if config.IS_PRODUCTION else logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
log = logging.getLogger("lookcheck")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_BYTES
CORS(app, origins=config.CORS_ORIGINS)

database.init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def error(message, status=400):
    return jsonify({"error": message}), status


def body():
    return request.get_json(silent=True) or {}


def rate_limited(limit, window_seconds, name):
    """Per-user when authenticated, per-IP otherwise."""

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            scope = getattr(g, "user_id", None) or request.remote_addr or "anonymous"
            try:
                security.check_rate_limit(f"{name}:{scope}", limit, window_seconds)
            except security.RateLimitExceeded as exc:
                response = error("Too many requests. Please try again shortly.", 429)
                response[0].headers["Retry-After"] = str(exc.retry_after_seconds)
                return response
            return view(*args, **kwargs)

        return wrapper

    return decorator


def coordinate(value, limit):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid coordinates.")
    if not -limit <= number <= limit:
        raise ValueError("Invalid coordinates.")
    return number


@app.errorhandler(404)
def not_found(_):
    return error("Not found.", 404)


@app.errorhandler(413)
def too_large(_):
    return error(f"That file is too large (max {config.MAX_UPLOAD_MB} MB).", 413)


@app.errorhandler(Exception)
def unhandled(exc):
    log.exception("Unhandled error: %s", exc)
    return error("Something went wrong on our side.", 500)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
@rate_limited(10, 3600, "register")
def register():
    data = body()
    try:
        lat = coordinate(data.get("lat"), 90)
        lon = coordinate(data.get("lon"), 180)
        user, token = auth.register(
            email=data.get("email"),
            password=data.get("password"),
            name=data.get("name"),
            style_preference=data.get("style_preference"),
            city=(data.get("city") or None),
            lat=lat,
            lon=lon,
        )
    except auth.AuthError as exc:
        return error(exc.message, exc.status)
    except ValueError as exc:
        return error(str(exc))

    return jsonify({"user": user, "token": token}), 201


@app.post("/api/auth/login")
@rate_limited(15, 900, "login")
def login():
    data = body()
    try:
        user, token = auth.login(data.get("email"), data.get("password"))
    except auth.AuthError as exc:
        return error(exc.message, exc.status)
    return jsonify({"user": user, "token": token})


@app.get("/api/auth/me")
@auth.require_auth
def me():
    return jsonify(g.user)


@app.patch("/api/auth/me")
@auth.require_auth
def update_me():
    data = body()
    name = data.get("name")
    style = data.get("style_preference")

    if name is not None:
        name = str(name).strip()
        if not name or len(name) > 80:
            return error("Please enter a valid name.")
    if style is not None and style not in ai_service.STYLES:
        return error(f"Style must be one of: {', '.join(ai_service.STYLES)}")

    return jsonify(database.update_user_profile(g.user_id, name=name, style_preference=style))


@app.put("/api/auth/me/location")
@auth.require_auth
def update_location():
    data = body()
    try:
        lat = coordinate(data.get("lat"), 90)
        lon = coordinate(data.get("lon"), 180)
    except ValueError as exc:
        return error(str(exc))
    if lat is None or lon is None:
        return error("'lat' and 'lon' are required.")

    city = (data.get("city") or None)
    return jsonify(database.update_user_location(g.user_id, city, lat, lon))


@app.post("/api/auth/me/ai-consent")
@auth.require_auth
def ai_consent():
    """Explicit opt-in before any personal data reaches a third-party AI.
    Required by the app stores, and the right default regardless."""
    granted = bool(body().get("granted"))
    return jsonify(database.set_ai_consent(g.user_id, granted))


@app.delete("/api/auth/me")
@auth.require_auth
def delete_account():
    """In-app account deletion. Removes the user and, by cascade, their
    wardrobe, outfits and feedback."""
    database.delete_user(g.user_id)
    return "", 204


# ---------------------------------------------------------------------------
# Wardrobe
# ---------------------------------------------------------------------------

@app.get("/api/wardrobe")
@auth.require_auth
def get_wardrobe():
    return jsonify(database.get_wardrobe(g.user_id))


@app.post("/api/wardrobe")
@auth.require_auth
def add_wardrobe_item():
    data = body()
    missing = [f for f in ("category", "color", "style", "warmth_level") if not data.get(f)]
    if missing:
        return error(f"Missing fields: {', '.join(missing)}")

    category = str(data["category"]).strip().lower()
    if category not in ai_service.CATEGORIES:
        return error(f"Category must be one of: {', '.join(ai_service.CATEGORIES)}")

    try:
        warmth = int(data["warmth_level"])
    except (TypeError, ValueError):
        return error("'warmth_level' must be a number from 1 to 5.")
    if not 1 <= warmth <= 5:
        return error("'warmth_level' must be between 1 and 5.")

    if database.count_wardrobe_items(g.user_id) >= config.MAX_WARDROBE_ITEMS:
        return error(f"Wardrobe limit reached ({config.MAX_WARDROBE_ITEMS} items).", 422)

    item_id = database.add_clothing_item(
        user_id=g.user_id,
        category=category,
        color=str(data["color"]).strip()[:40],
        style=str(data["style"]).strip()[:40],
        warmth_level=warmth,
        description=(str(data.get("description")).strip()[:300] if data.get("description") else None),
        image_url=data.get("image_url"),
        source_link=data.get("source_link"),
    )
    return jsonify(database.get_clothing_item(item_id, g.user_id)), 201


@app.patch("/api/wardrobe/<int:item_id>")
@auth.require_auth
def update_wardrobe_item(item_id):
    if not database.get_clothing_item(item_id, g.user_id):
        return error("Item not found.", 404)

    data = body()
    fields = {}
    if "category" in data:
        category = str(data["category"]).strip().lower()
        if category not in ai_service.CATEGORIES:
            return error(f"Category must be one of: {', '.join(ai_service.CATEGORIES)}")
        fields["category"] = category
    if "warmth_level" in data:
        try:
            warmth = int(data["warmth_level"])
        except (TypeError, ValueError):
            return error("'warmth_level' must be a number from 1 to 5.")
        if not 1 <= warmth <= 5:
            return error("'warmth_level' must be between 1 and 5.")
        fields["warmth_level"] = warmth
    for key in ("color", "style", "description"):
        if key in data:
            fields[key] = str(data[key]).strip()[:300] or None

    return jsonify(database.update_clothing_item(item_id, g.user_id, fields))


@app.delete("/api/wardrobe/<int:item_id>")
@auth.require_auth
def delete_wardrobe_item(item_id):
    if not database.delete_clothing_item(item_id, g.user_id):
        return error("Item not found.", 404)
    return "", 204


def _require_ai_consent():
    if ai_service.is_live() and not g.user.get("ai_consent_at"):
        return error(
            "Photo and link analysis sends the image or page to an external AI provider. "
            "Please accept AI processing in settings first.",
            403,
        )
    return None


@app.post("/api/wardrobe/analyze-photo")
@auth.require_auth
@rate_limited(config.MAX_ANALYSIS_PER_HOUR, 3600, "analysis")
def analyze_photo():
    """Returns structured attributes without saving. The client reviews and
    edits them, then POSTs to /api/wardrobe."""
    blocked = _require_ai_consent()
    if blocked:
        return blocked

    if "photo" not in request.files:
        return error("No 'photo' file uploaded.")

    photo = request.files["photo"]
    media_type = (photo.mimetype or "image/jpeg").split(";")[0]
    if media_type not in ("image/jpeg", "image/png", "image/webp", "image/heic"):
        return error("Please upload a JPEG, PNG or WebP image.")

    image_bytes = photo.read()
    if not image_bytes:
        return error("The uploaded file is empty.")

    try:
        return jsonify(ai_service.analyze_clothing_photo(image_bytes, media_type))
    except ai_service.AIServiceError as exc:
        return error(str(exc), 502)


@app.post("/api/wardrobe/parse-link")
@auth.require_auth
@rate_limited(config.MAX_ANALYSIS_PER_HOUR, 3600, "analysis")
def parse_link():
    blocked = _require_ai_consent()
    if blocked:
        return blocked

    url = body().get("url")
    if not url:
        return error("'url' is required.")

    try:
        return jsonify(ai_service.parse_product_link(url))
    except security.UnsafeUrlError as exc:
        return error(str(exc))
    except ai_service.AIServiceError as exc:
        return error(str(exc), 502)


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------

@app.get("/api/weather")
@auth.require_auth
@rate_limited(60, 3600, "weather")
def get_weather():
    try:
        lat = coordinate(request.args.get("lat"), 90)
        lon = coordinate(request.args.get("lon"), 180)
    except ValueError as exc:
        return error(str(exc))

    if lat is None or lon is None:
        lat, lon = g.user.get("lat"), g.user.get("lon")
    if lat is None or lon is None:
        return error("No location available. Set your location first.", 422)

    return jsonify(weather_service.get_weather_or_mock(lat, lon))


# ---------------------------------------------------------------------------
# Outfits
# ---------------------------------------------------------------------------

def _serialize_outfit(outfit):
    items = database.get_clothing_items_by_ids(outfit["item_ids"], outfit["user_id"])
    return {
        "outfit_id": outfit["id"],
        "date": outfit["outfit_date"],
        "items": items,
        "reasoning": outfit.get("reasoning"),
        "styling_tip": outfit.get("styling_tip"),
        "weather_summary": outfit.get("weather_summary"),
        "generated_by": outfit.get("generated_by"),
        "feedback": outfit.get("feedback"),
    }


def _generate_outfit(event=None):
    wardrobe = database.get_wardrobe(g.user_id)
    if not wardrobe:
        return error("Your wardrobe is empty. Add a few items first.", 422)

    if database.count_outfits_today(g.user_id) >= config.MAX_OUTFITS_PER_DAY:
        return error(
            f"You've reached today's limit of {config.MAX_OUTFITS_PER_DAY} suggestions. "
            "Come back tomorrow.",
            429,
        )

    weather = weather_service.get_weather_or_mock(g.user.get("lat"), g.user.get("lon"))

    suggestion = ai_service.generate_outfit(
        wardrobe_items=wardrobe,
        weather=weather,
        style_preference=g.user.get("style_preference") or "Casual",
        event=event,
        recently_used_ids=database.get_recently_used_item_ids(g.user_id, lookback=3),
        disliked_counts=database.get_disliked_item_ids(g.user_id),
    )

    outfit_id = database.save_outfit(
        user_id=g.user_id,
        item_ids=suggestion["item_ids"],
        weather_summary=f"{weather['temp_c']}°C, {weather['description']}",
        reasoning=suggestion["reasoning"],
        styling_tip=suggestion.get("styling_tip"),
        event_id=event["id"] if event else None,
        generated_by=suggestion["generated_by"],
    )

    payload = _serialize_outfit(database.get_outfit(outfit_id, g.user_id))
    payload["weather"] = weather
    return jsonify(payload)


@app.get("/api/outfit/today")
@auth.require_auth
def outfit_today():
    """Returns today's look, generating it only if it doesn't exist yet.
    Opening the app repeatedly is free and shows a stable recommendation."""
    existing = database.get_todays_outfit(g.user_id)
    if existing:
        payload = _serialize_outfit(existing)
        payload["weather"] = weather_service.get_weather_or_mock(
            g.user.get("lat"), g.user.get("lon")
        )
        return jsonify(payload)
    return _generate_outfit()


@app.post("/api/outfit/today")
@auth.require_auth
@rate_limited(config.MAX_OUTFITS_PER_DAY, 86400, "outfit")
def regenerate_outfit_today():
    """Explicit "suggest something else". Counts against the daily limit."""
    return _generate_outfit()


@app.post("/api/outfit/event")
@auth.require_auth
@rate_limited(config.MAX_OUTFITS_PER_DAY, 86400, "outfit")
def outfit_for_event():
    event_name = body().get("event_name")
    if not event_name:
        return error("'event_name' is required. See /api/events for valid options.")

    event = database.get_event_by_name(event_name)
    if not event:
        return error(f"Unknown event '{event_name}'. See /api/events for valid options.")

    return _generate_outfit(event=event)


@app.get("/api/events")
@auth.require_auth
def get_events():
    return jsonify(database.list_events())


@app.get("/api/outfits/history")
@auth.require_auth
def outfit_history():
    limit = request.args.get("limit", default=14, type=int) or 14
    limit = max(1, min(60, limit))
    outfits = database.get_recent_outfits(g.user_id, limit=limit)
    return jsonify([_serialize_outfit(outfit) for outfit in outfits])


@app.post("/api/outfits/<int:outfit_id>/feedback")
@auth.require_auth
def outfit_feedback(outfit_id):
    rating = str(body().get("rating") or "").lower()
    if rating not in ("like", "dislike"):
        return error("'rating' must be 'like' or 'dislike'.")
    if not database.get_outfit(outfit_id, g.user_id):
        return error("Outfit not found.", 404)

    database.set_outfit_feedback(outfit_id, g.user_id, rating)
    return jsonify({"outfit_id": outfit_id, "rating": rating})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    payload = {"status": "ok", "date": date.today().isoformat()}
    payload.update(config.summary())
    return jsonify(payload)


if __name__ == "__main__":
    log.info(
        "Starting LookCheck AI on port %s (ai=%s, weather=%s)",
        config.PORT, config.AI_PROVIDER, config.WEATHER_PROVIDER,
    )
    app.run(host="0.0.0.0", port=config.PORT, debug=not config.IS_PRODUCTION)
