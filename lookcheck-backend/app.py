"""
LookCheck AI - backend API

A Flask REST API that powers the LookCheck AI mobile app:
  - manage a user's digital wardrobe (add items by photo or product link)
  - fetch live weather for the user's location
  - generate an AI-picked outfit for today, or for a specific event

Run locally:
    pip install -r requirements.txt
    cp .env.example .env   # then fill in your API keys
    python app.py

The app works out of the box in "demo mode" even without API keys -
weather and AI calls fall back to deterministic mock data so you can
explore every endpoint immediately.
"""

import os
from flask import Flask, request, jsonify
from dotenv import load_dotenv

import database
from services import weather_service, ai_service

load_dotenv()

app = Flask(__name__)
database.init_db()


def error_response(message, status=400):
    return jsonify({"error": message}), status


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@app.post("/api/users")
def create_user():
    data = request.get_json(force=True)
    if not data.get("name"):
        return error_response("'name' is required")

    user_id = database.create_user(
        name=data["name"],
        style_preference=data.get("style_preference", "Casual"),
        city=data.get("city"),
        lat=data.get("lat"),
        lon=data.get("lon"),
    )
    return jsonify(database.get_user(user_id)), 201


@app.get("/api/users/<int:user_id>")
def get_user(user_id):
    user = database.get_user(user_id)
    if not user:
        return error_response("User not found", 404)
    return jsonify(user)


@app.put("/api/users/<int:user_id>/location")
def update_location(user_id):
    data = request.get_json(force=True)
    if "lat" not in data or "lon" not in data:
        return error_response("'lat' and 'lon' are required")
    database.update_user_location(user_id, data.get("city"), data["lat"], data["lon"])
    return jsonify(database.get_user(user_id))


# ---------------------------------------------------------------------------
# Wardrobe
# ---------------------------------------------------------------------------

@app.get("/api/users/<int:user_id>/wardrobe")
def get_wardrobe(user_id):
    return jsonify(database.get_wardrobe(user_id))


@app.post("/api/users/<int:user_id>/wardrobe")
def add_wardrobe_item(user_id):
    """Add an item directly with known attributes (used after analyze-photo / parse-link,
    or for manual entry)."""
    data = request.get_json(force=True)
    required = ["category", "color", "style", "warmth_level"]
    missing = [field for field in required if field not in data]
    if missing:
        return error_response(f"Missing fields: {', '.join(missing)}")

    item_id = database.add_clothing_item(
        user_id=user_id,
        category=data["category"],
        color=data["color"],
        style=data["style"],
        warmth_level=data["warmth_level"],
        description=data.get("description"),
        image_url=data.get("image_url"),
        source_link=data.get("source_link"),
    )
    return jsonify({"id": item_id, **data}), 201


@app.delete("/api/users/<int:user_id>/wardrobe/<int:item_id>")
def delete_wardrobe_item(user_id, item_id):
    deleted = database.delete_clothing_item(item_id, user_id)
    if not deleted:
        return error_response("Item not found", 404)
    return "", 204


@app.post("/api/wardrobe/analyze-photo")
def analyze_photo():
    """
    Accepts a multipart/form-data upload with field name 'photo'.
    Returns structured clothing attributes (does NOT save to the wardrobe -
    the client reviews/edits, then POSTs to /api/users/<id>/wardrobe).
    """
    if "photo" not in request.files:
        return error_response("No 'photo' file uploaded")

    photo = request.files["photo"]
    image_bytes = photo.read()
    media_type = photo.mimetype or "image/jpeg"

    try:
        attributes = ai_service.analyze_clothing_photo(image_bytes, media_type)
    except ai_service.AIServiceError as exc:
        return error_response(str(exc), 502)

    return jsonify(attributes)


@app.post("/api/wardrobe/parse-link")
def parse_link():
    data = request.get_json(force=True)
    url = data.get("url")
    if not url:
        return error_response("'url' is required")

    try:
        attributes = ai_service.parse_product_link(url)
    except ai_service.AIServiceError as exc:
        return error_response(str(exc), 502)

    return jsonify(attributes)


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------

@app.get("/api/weather")
def get_weather():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    if lat is None or lon is None:
        return error_response("'lat' and 'lon' query params are required")

    try:
        weather = weather_service.get_current_weather(lat, lon)
    except weather_service.WeatherServiceError as exc:
        # Fall back to a mock so the demo still works without an API key
        weather = weather_service.mock_weather()
        weather["_note"] = str(exc)
    return jsonify(weather)


# ---------------------------------------------------------------------------
# Outfits
# ---------------------------------------------------------------------------

def _build_outfit_response(user, event=None):
    wardrobe = database.get_wardrobe(user["id"])
    if not wardrobe:
        return error_response(
            "Wardrobe is empty. Add some clothing items before requesting an outfit.", 422
        )

    if user["lat"] is not None and user["lon"] is not None:
        try:
            weather = weather_service.get_current_weather(user["lat"], user["lon"])
        except weather_service.WeatherServiceError:
            weather = weather_service.mock_weather()
    else:
        weather = weather_service.mock_weather()

    excluded_ids = database.get_recently_used_item_ids(user["id"], days=3)

    try:
        suggestion = ai_service.generate_outfit(
            wardrobe_items=wardrobe,
            weather=weather,
            style_preference=user["style_preference"],
            event=event,
            excluded_item_ids=excluded_ids,
        )
    except ai_service.AIServiceError as exc:
        return error_response(str(exc), 502)

    chosen_items = database.get_clothing_items_by_ids(suggestion["item_ids"])

    outfit_id = database.save_outfit(
        user_id=user["id"],
        item_ids=suggestion["item_ids"],
        weather_summary=f"{weather['temp_c']}°C, {weather['description']}",
        reasoning=suggestion["reasoning"],
        event_id=event["id"] if event else None,
    )

    return jsonify({
        "outfit_id": outfit_id,
        "items": chosen_items,
        "reasoning": suggestion["reasoning"],
        "styling_tip": suggestion.get("styling_tip"),
        "weather": weather,
    })


@app.post("/api/users/<int:user_id>/outfit/today")
def outfit_today(user_id):
    user = database.get_user(user_id)
    if not user:
        return error_response("User not found", 404)
    return _build_outfit_response(user, event=None)


@app.post("/api/users/<int:user_id>/outfit/event")
def outfit_for_event(user_id):
    user = database.get_user(user_id)
    if not user:
        return error_response("User not found", 404)

    data = request.get_json(force=True)
    event_name = data.get("event_name")
    event = database.get_event_by_name(event_name) if event_name else None
    if event_name and not event:
        return error_response(f"Unknown event '{event_name}'. See /api/events for valid options.")

    return _build_outfit_response(user, event=event)


@app.get("/api/events")
def get_events():
    return jsonify(database.list_events())


@app.get("/api/users/<int:user_id>/outfits/history")
def outfit_history(user_id):
    limit = request.args.get("limit", default=14, type=int)
    return jsonify(database.get_recent_outfits(user_id, limit=limit))


# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "ai_configured": bool(ai_service.ANTHROPIC_API_KEY),
        "weather_configured": bool(weather_service.OPENWEATHER_API_KEY),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
