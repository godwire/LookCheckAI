"""
AI service for LookCheck AI - talks to the Claude API directly over HTTPS
using `requests`, without the official `anthropic` SDK. This keeps the
project dependency-free (stdlib + requests only) while still giving full
control over the request/response shape.

Three responsibilities:
  1. analyze_clothing_photo  - turn a photo of a garment into structured data
  2. parse_product_link      - turn a store product page into structured data
  3. generate_outfit         - pick today's/event outfit from the wardrobe

If ANTHROPIC_API_KEY is not set, every function falls back to a small,
deterministic mock so the whole app can be demoed / developed without a key.
"""

import os
import json
import base64
import requests

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
MODEL = "claude-sonnet-4-5"

CLOTHING_ATTRIBUTES_SCHEMA = """Respond with ONLY a JSON object (no prose, no markdown fences) shaped like:
{
  "category": "top" | "bottom" | "outerwear" | "footwear" | "accessory",
  "color": "<main color, one or two words>",
  "style": "<one of: Casual, Streetwear, Business, Minimalist, Sport, Formal>",
  "warmth_level": <integer 1-5, 1 = very light/summer, 5 = very warm/winter>,
  "description": "<one short sentence describing the item>"
}"""


class AIServiceError(Exception):
    pass


def _call_claude(messages, max_tokens=1024, system=None):
    if not ANTHROPIC_API_KEY:
        raise AIServiceError(
            "ANTHROPIC_API_KEY is not set. Add it to your .env file "
            "(see .env.example) to enable live AI calls."
        )

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    payload = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        payload["system"] = system

    response = requests.post(ANTHROPIC_API_URL, headers=headers, json=payload, timeout=30)
    if response.status_code != 200:
        raise AIServiceError(f"Claude API request failed ({response.status_code}): {response.text}")

    data = response.json()
    text_blocks = [block["text"] for block in data.get("content", []) if block.get("type") == "text"]
    return "\n".join(text_blocks)


def _extract_json(text):
    """Claude is asked to return raw JSON, but we defensively strip code fences if present."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    return json.loads(cleaned.strip())


# ---------- 1. Photo -> structured clothing attributes ----------

def analyze_clothing_photo(image_bytes, media_type="image/jpeg"):
    """
    image_bytes: raw bytes of the uploaded photo.
    Returns a dict matching CLOTHING_ATTRIBUTES_SCHEMA.
    """
    if not ANTHROPIC_API_KEY:
        return _mock_clothing_attributes()

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                },
                {
                    "type": "text",
                    "text": (
                        "This is a photo of a single clothing item from my wardrobe. "
                        "Identify it and describe it.\n\n" + CLOTHING_ATTRIBUTES_SCHEMA
                    ),
                },
            ],
        }
    ]

    raw = _call_claude(messages, max_tokens=300)
    return _extract_json(raw)


# ---------- 2. Product link -> structured clothing attributes ----------

def parse_product_link(url):
    """
    Fetches the product page's text content and asks Claude to extract
    structured clothing attributes from it (title, description, price copy, etc).
    """
    try:
        page = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        page_text = page.text[:6000]  # keep the prompt small
    except requests.RequestException as exc:
        raise AIServiceError(f"Could not fetch product page: {exc}")

    if not ANTHROPIC_API_KEY:
        return _mock_clothing_attributes(source_link=url)

    messages = [
        {
            "role": "user",
            "content": (
                "Below is the raw HTML/text of an online store product page for a clothing item. "
                "Extract the item's attributes.\n\n"
                f"{CLOTHING_ATTRIBUTES_SCHEMA}\n\n"
                f"PAGE CONTENT:\n{page_text}"
            ),
        }
    ]

    raw = _call_claude(messages, max_tokens=300)
    result = _extract_json(raw)
    result["source_link"] = url
    return result


# ---------- 3. Outfit generation ----------

def generate_outfit(wardrobe_items, weather, style_preference, event=None,
                     excluded_item_ids=None):
    """
    wardrobe_items: list of dicts (id, category, color, style, warmth_level, description)
    weather: dict from weather_service.get_current_weather / mock_weather
    style_preference: e.g. "Minimalist"
    event: dict from database.get_event_by_name, or None for a regular daily look
    excluded_item_ids: iterable of item ids recently used, to encourage variety

    Returns:
    {
        "item_ids": [3, 7, 12],
        "reasoning": "<short, friendly explanation of the choice>",
        "styling_tip": "<one extra tip, e.g. accessory or layering suggestion>"
    }
    """
    if not ANTHROPIC_API_KEY:
        return _mock_outfit(wardrobe_items, excluded_item_ids)

    excluded_item_ids = excluded_item_ids or set()
    wardrobe_json = json.dumps(wardrobe_items, ensure_ascii=False)
    event_line = (
        f"Occasion: {event['name']} - dress code: {event['dress_code_description']}"
        if event else "Occasion: everyday / no specific event"
    )

    prompt = f"""You are a personal stylist. Choose one complete outfit for today from the
user's digital wardrobe below.

Wardrobe (JSON array of items, each with an "id"):
{wardrobe_json}

Weather: {weather['temp_c']}°C, feels like {weather['feels_like_c']}°C, {weather['description']},
rain expected: {weather['rain_probability']}, wind {weather['wind_speed_ms']} m/s.

User's preferred style: {style_preference}
{event_line}
Avoid reusing these item ids if a reasonable alternative exists: {sorted(excluded_item_ids)}

Rules:
- Pick a coherent, weather-appropriate, comfortable outfit (normally: one top, one bottom
  OR one full-body piece, footwear, and optionally outerwear/accessories).
- Only use item ids that exist in the wardrobe above.
- Consider color coordination and the requested style/occasion.

Respond with ONLY a JSON object (no prose, no markdown fences) shaped like:
{{
  "item_ids": [<ids of chosen wardrobe items>],
  "reasoning": "<1-2 friendly sentences explaining why this outfit works today>",
  "styling_tip": "<one short extra styling tip>"
}}"""

    messages = [{"role": "user", "content": prompt}]
    raw = _call_claude(messages, max_tokens=500)
    return _extract_json(raw)


# ---------- Mocks (used when no ANTHROPIC_API_KEY is configured) ----------

def _mock_clothing_attributes(source_link=None):
    result = {
        "category": "top",
        "color": "White",
        "style": "Casual",
        "warmth_level": 2,
        "description": "A plain white cotton T-shirt (demo mode - no ANTHROPIC_API_KEY set).",
    }
    if source_link:
        result["source_link"] = source_link
    return result


def _mock_outfit(wardrobe_items, excluded_item_ids=None):
    excluded_item_ids = excluded_item_ids or set()
    candidates = [item for item in wardrobe_items if item["id"] not in excluded_item_ids] or wardrobe_items
    chosen_ids = [item["id"] for item in candidates[:3]]
    return {
        "item_ids": chosen_ids,
        "reasoning": "Demo mode (no ANTHROPIC_API_KEY set) - showing the first available items.",
        "styling_tip": "Add ANTHROPIC_API_KEY to get real AI-generated outfit suggestions.",
    }
