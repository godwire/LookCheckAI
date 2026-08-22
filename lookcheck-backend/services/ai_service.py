"""
AI service for LookCheck AI.

Two design decisions worth stating up front:

1. The provider is pluggable (`AI_PROVIDER`): `mock`, `gemini` (free tier) or
   `anthropic`. Calls go out over plain HTTPS with `requests`, no vendor SDK,
   so switching provider costs one function, not a dependency tree.

2. Selection and explanation are separate concerns. Deterministic code filters
   the wardrobe down to weather-appropriate candidates and can assemble a
   complete outfit on its own. The model only ever picks from that pre-filtered
   set and writes the explanation. Anything it returns is validated against the
   real wardrobe before it reaches the user - a hallucinated id is dropped, not
   displayed.

Consequence: with no API key at all, every endpoint still returns a sensible,
weather-aware outfit. The AI improves the result, it isn't a prerequisite.
"""

import base64
import html as html_lib
import json
import re
import time

import requests

import config
import security

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Free-tier Gemini returns 503 "model overloaded" fairly often. Retrying with
# a short backoff turns most of those into a successful request.
GEMINI_MAX_ATTEMPTS = 3
GEMINI_BACKOFF_SECONDS = 1.5

CATEGORIES = ("top", "bottom", "outerwear", "footwear", "accessory")
STYLES = ("Casual", "Streetwear", "Business", "Minimalist", "Sport", "Formal")

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


def provider():
    return config.AI_PROVIDER


def is_live():
    return config.AI_PROVIDER != "mock"


# ---------------------------------------------------------------------------
# Provider transport
# ---------------------------------------------------------------------------

def _complete(prompt, image_bytes=None, media_type="image/jpeg", max_tokens=600):
    """Single entry point to whichever model is configured. Returns raw text."""
    if config.AI_PROVIDER == "gemini":
        return _complete_gemini(prompt, image_bytes, media_type, max_tokens)
    if config.AI_PROVIDER == "anthropic":
        return _complete_anthropic(prompt, image_bytes, media_type, max_tokens)
    raise AIServiceError("No AI provider is configured.")


def _complete_anthropic(prompt, image_bytes, media_type, max_tokens):
    content = []
    if image_bytes:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.b64encode(image_bytes).decode("utf-8"),
            },
        })
    content.append({"type": "text", "text": prompt})

    payload = {
        "model": config.ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": content}],
    }
    headers = {
        "x-api-key": config.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }

    try:
        response = requests.post(
            ANTHROPIC_API_URL, headers=headers, json=payload, timeout=config.AI_TIMEOUT
        )
    except requests.RequestException as exc:
        raise AIServiceError(f"AI request failed: {exc}")

    if response.status_code != 200:
        raise AIServiceError(f"Claude API request failed ({response.status_code})")

    data = response.json()
    blocks = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(blocks)


def _complete_gemini(prompt, image_bytes, media_type, max_tokens):
    parts = [{"text": prompt}]
    if image_bytes:
        parts.insert(0, {
            "inline_data": {
                "mime_type": media_type,
                "data": base64.b64encode(image_bytes).decode("utf-8"),
            }
        })

    url = f"{GEMINI_API_URL}/{config.GEMINI_MODEL}:generateContent"
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
    }
    headers = {
        "x-goog-api-key": config.GEMINI_API_KEY,
        "content-type": "application/json",
    }

    # 503 (model overloaded) and 429 (rate limited) are routine on the free
    # tier and usually clear within a second or two, so retry rather than
    # failing the user's request on the first attempt.
    last_error = None
    for attempt in range(GEMINI_MAX_ATTEMPTS):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=config.AI_TIMEOUT)
        except requests.RequestException as exc:
            last_error = AIServiceError(f"AI request failed: {exc}")
            time.sleep(GEMINI_BACKOFF_SECONDS * (attempt + 1))
            continue

        if response.status_code == 200:
            data = response.json()
            try:
                parts = data["candidates"][0]["content"]["parts"]
            except (KeyError, IndexError):
                raise AIServiceError("Gemini returned no usable content.")
            return "\n".join(part.get("text", "") for part in parts)

        detail = ""
        try:
            detail = response.json().get("error", {}).get("message", "")
        except ValueError:
            detail = response.text[:200]

        if response.status_code == 404:
            raise AIServiceError(
                f"Model '{config.GEMINI_MODEL}' is not available for your API key. "
                f"Run 'python list_gemini_models.py' to see valid names. ({detail})"
            )

        if response.status_code in (429, 500, 502, 503, 504):
            last_error = AIServiceError(
                "The AI service is busy right now. Please try again in a moment."
            )
            time.sleep(GEMINI_BACKOFF_SECONDS * (attempt + 1))
            continue

        raise AIServiceError(f"Gemini API request failed ({response.status_code}): {detail}")

    raise last_error or AIServiceError("The AI service is unavailable right now.")


def _extract_json(text):
    """Models are asked for raw JSON but sometimes wrap it. Be forgiving."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"```\s*$", "", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise AIServiceError("The AI response could not be read.")


# ---------------------------------------------------------------------------
# Attribute normalisation
# ---------------------------------------------------------------------------

def _normalize_attributes(raw, source_link=None, image_url=None):
    """Never trust the model's shape. Coerce into something the DB accepts."""
    if not isinstance(raw, dict):
        raise AIServiceError("The AI response could not be read.")

    category = str(raw.get("category", "")).strip().lower()
    if category not in CATEGORIES:
        category = "top"

    style = str(raw.get("style", "")).strip().title()
    if style not in STYLES:
        style = "Casual"

    try:
        warmth = int(raw.get("warmth_level", 3))
    except (TypeError, ValueError):
        warmth = 3
    warmth = max(1, min(5, warmth))

    color = str(raw.get("color") or "Unknown").strip()[:40] or "Unknown"
    description = str(raw.get("description") or "").strip()[:300] or None

    result = {
        "category": category,
        "color": color,
        "style": style,
        "warmth_level": warmth,
        "description": description,
    }
    if source_link:
        result["source_link"] = source_link
    if image_url:
        result["image_url"] = image_url
    return result


# ---------------------------------------------------------------------------
# 1. Photo -> structured clothing attributes
# ---------------------------------------------------------------------------

def analyze_clothing_photo(image_bytes, media_type="image/jpeg"):
    if not is_live():
        return _mock_clothing_attributes()

    prompt = (
        "This is a photo of a single clothing item from someone's wardrobe. "
        "Identify it and describe it.\n\n" + CLOTHING_ATTRIBUTES_SCHEMA
    )
    raw = _complete(prompt, image_bytes=image_bytes, media_type=media_type, max_tokens=300)
    return _normalize_attributes(_extract_json(raw))


# ---------------------------------------------------------------------------
# 2. Product link -> structured clothing attributes
# ---------------------------------------------------------------------------

JSON_LD_PATTERN = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
META_PATTERN = re.compile(r"<meta\s+([^>]+?)/?>", re.IGNORECASE)
ATTR_PATTERN = re.compile(r'([\w:.-]+)\s*=\s*["\']([^"\']*)["\']')
TITLE_PATTERN = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL | re.IGNORECASE)

# Meta keys worth keeping.
INTERESTING_META = (
    "og:title", "og:description", "og:image", "og:site_name",
    "twitter:title", "twitter:description", "twitter:image",
    "description", "product:brand", "product:color", "product:price:amount",
)


def _clean(text, limit=400):
    if not text:
        return None
    value = html_lib.unescape(str(text))
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit] or None


def _extract_meta(html):
    found = {}
    for raw_attrs in META_PATTERN.findall(html):
        attrs = {k.lower(): v for k, v in ATTR_PATTERN.findall(raw_attrs)}
        key = attrs.get("property") or attrs.get("name")
        content = attrs.get("content")
        if key and content and key.lower() in INTERESTING_META:
            found.setdefault(key.lower(), _clean(content))
    return found


def _walk_for_product(node):
    """schema.org data is often nested inside @graph or arrays."""
    if isinstance(node, list):
        for entry in node:
            found = _walk_for_product(entry)
            if found:
                return found
    elif isinstance(node, dict):
        node_type = node.get("@type")
        types = node_type if isinstance(node_type, list) else [node_type]
        if any(str(t).lower() == "product" for t in types if t):
            return node
        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in node:
                found = _walk_for_product(node[key])
                if found:
                    return found
    return None


def _extract_json_ld_product(html):
    """Most e-commerce platforms embed schema.org Product data for Google.
    It survives client-side rendering, which raw page text often does not."""
    for block in JSON_LD_PATTERN.findall(html):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue

        product = _walk_for_product(data)
        if not product:
            continue

        brand = product.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")

        image = product.get("image")
        if isinstance(image, list):
            image = image[0] if image else None
        if isinstance(image, dict):
            image = image.get("url")

        return {
            "name": _clean(product.get("name"), 200),
            "description": _clean(product.get("description"), 800),
            "brand": _clean(brand, 80),
            "color": _clean(product.get("color"), 60),
            "material": _clean(product.get("material"), 80),
            "category": _clean(product.get("category"), 100),
            "image": image if isinstance(image, str) else None,
        }
    return None


def _visible_text(html):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html,
                  flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()[:config.MAX_PAGE_CHARS]


def fetch_product_page(url):
    """Fetches a product page defensively: validated host, capped size.

    Returns structured metadata rather than a wall of text. Modern stores
    render descriptions with JavaScript, so scraping visible text alone
    returns almost nothing - but the JSON-LD and OpenGraph blocks that power
    Google results and social previews are in the served HTML.
    """
    safe_url = security.validate_public_url(url)

    try:
        response = requests.get(
            safe_url,
            timeout=config.PAGE_FETCH_TIMEOUT,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; LookCheckAI/1.0)",
                "Accept-Language": "en;q=0.9",
            },
            stream=True,
            allow_redirects=True,
        )
        status = response.status_code
        chunks, total = [], 0
        for chunk in response.iter_content(chunk_size=8192):
            chunks.append(chunk)
            total += len(chunk)
            if total >= config.MAX_PAGE_BYTES:
                break
        response.close()
    except requests.RequestException as exc:
        raise AIServiceError(f"Could not open that product page: {exc}")

    if status >= 400:
        raise AIServiceError(
            f"That store returned an error ({status}). It may be blocking automated access."
        )

    html = b"".join(chunks).decode("utf-8", errors="ignore")
    title_match = TITLE_PATTERN.search(html)

    return {
        "title": _clean(title_match.group(1)) if title_match else None,
        "meta": _extract_meta(html),
        "product": _extract_json_ld_product(html),
        "text": _visible_text(html),
    }


def _fetch_image(image_url):
    """Downloads the product image so the model can look at the item itself.
    Validated and size-capped exactly like the page fetch."""
    try:
        safe_url = security.validate_public_url(image_url)
    except security.UnsafeUrlError:
        return None, None

    try:
        response = requests.get(
            safe_url,
            timeout=config.PAGE_FETCH_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LookCheckAI/1.0)"},
            stream=True,
        )
        if response.status_code != 200:
            return None, None

        media_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if media_type not in ("image/jpeg", "image/png", "image/webp"):
            return None, None

        chunks, total = [], 0
        for chunk in response.iter_content(chunk_size=8192):
            chunks.append(chunk)
            total += len(chunk)
            if total >= config.MAX_IMAGE_BYTES:
                return None, None
        response.close()
    except requests.RequestException:
        return None, None

    return b"".join(chunks), media_type


def _summarize_page(page):
    """Turns the scraped page into a compact briefing for the model."""
    lines = []
    product = page.get("product")

    if product:
        lines.append("Structured product data from the page:")
        for label, key in (
            ("Name", "name"), ("Brand", "brand"), ("Colour", "color"),
            ("Material", "material"), ("Category", "category"),
            ("Description", "description"),
        ):
            if product.get(key):
                lines.append(f"  {label}: {product[key]}")

    meta = page.get("meta") or {}
    og_title = meta.get("og:title") or page.get("title")
    og_description = meta.get("og:description") or meta.get("description")
    if og_title:
        lines.append(f"Page title: {og_title}")
    if og_description:
        lines.append(f"Page description: {og_description}")

    # The raw text is a last resort: noisy, and empty on JS-rendered stores.
    if not product and not og_description and page.get("text"):
        lines.append(f"Visible page text: {page['text'][:2000]}")

    return "\n".join(lines).strip()


def parse_product_link(url):
    page = fetch_product_page(url)

    product = page.get("product") or {}
    meta = page.get("meta") or {}
    image_url = None
    for candidate in (product.get("image"), meta.get("og:image"), meta.get("twitter:image")):
        if candidate and str(candidate).startswith("http"):
            image_url = candidate
            break

    if not is_live():
        return _mock_clothing_attributes(source_link=url, image_url=image_url)

    summary = _summarize_page(page)
    if not summary:
        raise AIServiceError(
            "No product details could be read from that page. The store may render its "
            "content with JavaScript or block automated access - try adding the item by photo."
        )

    # If the page exposes a product image, show it to the model too: seeing the
    # garment beats reading marketing copy about it.
    image_bytes, media_type = (None, None)
    if image_url:
        image_bytes, media_type = _fetch_image(image_url)

    prompt = (
        "Below is information about a clothing item from an online store"
        + (", together with its product photo" if image_bytes else "")
        + ". Extract the item's attributes.\n\n"
        + CLOTHING_ATTRIBUTES_SCHEMA
        + f"\n\nPRODUCT INFORMATION:\n{summary}"
    )

    raw = _complete(
        prompt,
        image_bytes=image_bytes,
        media_type=media_type or "image/jpeg",
        max_tokens=300,
    )
    return _normalize_attributes(_extract_json(raw), source_link=url, image_url=image_url)


# ---------------------------------------------------------------------------
# 3. Outfit generation
# ---------------------------------------------------------------------------

def warmth_range_for(weather):
    """Deterministic hard constraint: which warmth levels make sense today."""
    temp = weather.get("feels_like_c", weather.get("temp_c", 15))
    if temp >= 25:
        return (1, 2)
    if temp >= 19:
        return (1, 3)
    if temp >= 13:
        return (2, 3)
    if temp >= 6:
        return (2, 4)
    if temp >= 0:
        return (3, 5)
    return (4, 5)


def needs_outerwear(weather):
    temp = weather.get("feels_like_c", weather.get("temp_c", 15))
    return temp < 14 or bool(weather.get("rain_probability")) or weather.get("wind_speed_ms", 0) > 9


def select_candidates(wardrobe, weather, penalised_ids=None):
    """Applies hard constraints before anything reaches the model.

    Keeps the prompt small (cheaper, and free tiers have token limits) and
    guarantees the model can only choose weather-appropriate items.
    """
    penalised_ids = penalised_ids or {}
    low, high = warmth_range_for(weather)

    by_category = {category: [] for category in CATEGORIES}
    for item in wardrobe:
        by_category.setdefault(item["category"], []).append(item)

    candidates = []
    for category, items in by_category.items():
        if not items:
            continue
        fitting = [i for i in items if low <= (i.get("warmth_level") or 3) <= high]
        if not fitting:
            # Nothing in range: fall back to the nearest warmth level, but only
            # within one and a half steps, so a winter coat never turns up on a
            # mild day just because it is the only outerwear owned.
            target = (low + high) / 2
            near = [i for i in items if abs((i.get("warmth_level") or 3) - target) <= 1.5]
            fitting = sorted(near, key=lambda i: abs((i.get("warmth_level") or 3) - target))[:3]

        fitting.sort(key=lambda i: penalised_ids.get(i["id"], 0))
        candidates.extend(fitting[:12])

    return candidates


def assemble_outfit(candidates, weather):
    """A complete, rule-based outfit. Used as the mock, and as the fallback
    whenever the model is unavailable or returns something unusable."""
    by_category = {category: [] for category in CATEGORIES}
    for item in candidates:
        by_category.setdefault(item["category"], []).append(item)

    chosen = []
    for category in ("top", "bottom", "footwear"):
        if by_category.get(category):
            chosen.append(by_category[category][0])
    if needs_outerwear(weather) and by_category.get("outerwear"):
        chosen.append(by_category["outerwear"][0])

    if not chosen and candidates:
        chosen = candidates[:3]

    return [item["id"] for item in chosen]


def _fallback_reasoning(weather, live):
    temp = round(weather.get("temp_c", 15))
    description = weather.get("description") or "the current conditions"
    base = f"Picked for {temp}°C and {description}."
    if needs_outerwear(weather):
        base += " Added a layer since it's cool or wet out."
    if not live:
        base += " (Demo mode - add an AI key for personalised styling.)"
    return base


def generate_outfit(wardrobe_items, weather, style_preference, event=None,
                    recently_used_ids=None, disliked_counts=None):
    """
    Returns:
    {
        "item_ids": [3, 7, 12],
        "reasoning": "...",
        "styling_tip": "...",
        "generated_by": "mock" | "gemini" | "anthropic",
    }

    Never raises on model failure: it degrades to the rule-based outfit.
    """
    recently_used_ids = set(recently_used_ids or [])
    penalties = dict(disliked_counts or {})
    for item_id in recently_used_ids:
        penalties[item_id] = penalties.get(item_id, 0) + 1

    candidates = select_candidates(wardrobe_items, weather, penalties)
    if not candidates:
        candidates = list(wardrobe_items)

    fallback = {
        "item_ids": assemble_outfit(candidates, weather),
        "reasoning": _fallback_reasoning(weather, is_live()),
        "styling_tip": None,
        "generated_by": "mock",
    }

    if not is_live():
        return fallback

    valid_ids = {item["id"] for item in candidates}
    compact = [
        {
            "id": item["id"],
            "category": item["category"],
            "color": item["color"],
            "style": item["style"],
            "warmth": item["warmth_level"],
            "note": (item.get("description") or "")[:80],
        }
        for item in candidates
    ]

    event_line = (
        f"Occasion: {event['name']} - dress code: {event['dress_code_description']}"
        if event else "Occasion: everyday, no specific event"
    )
    avoid = sorted(recently_used_ids & valid_ids)

    prompt = f"""You are a personal stylist. Choose one complete outfit from the items below.

Available items (already filtered to be weather-appropriate; you may ONLY use these ids):
{json.dumps(compact, ensure_ascii=False)}

Weather: {weather['temp_c']}C, feels like {weather['feels_like_c']}C, {weather['description']}, \
rain expected: {weather['rain_probability']}, wind {weather['wind_speed_ms']} m/s.
Preferred style: {style_preference}
{event_line}
Worn recently, prefer alternatives if any exist: {avoid}

Rules:
- Normally one top, one bottom, footwear, and outerwear if it is cold or wet.
- Use ONLY ids from the list above.
- Consider colour coordination, the stated style, and the occasion.

Respond with ONLY a JSON object (no prose, no markdown fences):
{{
  "item_ids": [<chosen ids>],
  "reasoning": "<1-2 friendly sentences on why this works today>",
  "styling_tip": "<one short styling tip>"
}}"""

    try:
        parsed = _extract_json(_complete(prompt, max_tokens=500))
    except AIServiceError:
        return fallback

    # Validate: keep only real, owned, candidate ids; preserve order; dedupe.
    seen, item_ids = set(), []
    for raw_id in parsed.get("item_ids") or []:
        try:
            item_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if item_id in valid_ids and item_id not in seen:
            seen.add(item_id)
            item_ids.append(item_id)

    if not item_ids:
        return fallback

    reasoning = str(parsed.get("reasoning") or "").strip()[:500]
    styling_tip = str(parsed.get("styling_tip") or "").strip()[:200] or None

    return {
        "item_ids": item_ids,
        "reasoning": reasoning or fallback["reasoning"],
        "styling_tip": styling_tip,
        "generated_by": provider(),
    }


# ---------------------------------------------------------------------------
# Mocks
# ---------------------------------------------------------------------------

def _mock_clothing_attributes(source_link=None, image_url=None):
    result = {
        "category": "top",
        "color": "White",
        "style": "Casual",
        "warmth_level": 2,
        "description": "A plain white cotton T-shirt (demo mode - no AI key configured).",
    }
    if source_link:
        result["source_link"] = source_link
    if image_url:
        result["image_url"] = image_url
    return result