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
import logging
import json
import re
import time
from urllib.parse import urljoin

import requests

import config
import security
from services import compatibility

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"

log = logging.getLogger("lookcheck.ai")

# Free-tier Gemini returns 503 "model overloaded" fairly often. Retrying with
# a short backoff turns most of those into a successful request.
GEMINI_MAX_ATTEMPTS = 3
GEMINI_BACKOFF_SECONDS = 1.5

# Gemini 2.5 accepts generationConfig.thinkingConfig; Gemini 3 rejects it.
# Rather than asking the user to match a setting to a model name, the first
# 400 flips this off for the rest of the process.
_thinking_config_supported = True

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
    return _complete_anthropic_content(content, max_tokens)


def _complete_anthropic_content(content, max_tokens):
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


def _gemini_payload(parts, max_tokens, with_thinking_config):
    generation_config = {"maxOutputTokens": max_tokens, "temperature": 0.7}

    if with_thinking_config:
        # Gemini 2.5 reasons before answering by default, and that reasoning is
        # billed against maxOutputTokens - on a small budget the whole
        # allowance is spent thinking and the reply comes back empty. We want
        # structured extraction, not deliberation.
        #
        # Gemini 3 controls this differently and rejects the 2.5 field with
        # INVALID_ARGUMENT, so this is sent optimistically and dropped for the
        # rest of the session the first time a model refuses it.
        generation_config["thinkingConfig"] = {"thinkingBudget": 0}

    return {"contents": [{"parts": parts}], "generationConfig": generation_config}


def _complete_gemini(prompt, image_bytes, media_type, max_tokens):
    parts = [{"text": prompt}]
    if image_bytes:
        parts.insert(0, {
            "inline_data": {
                "mime_type": media_type,
                "data": base64.b64encode(image_bytes).decode("utf-8"),
            }
        })
    return _complete_gemini_parts(parts, max_tokens)


def _complete_gemini_parts(parts, max_tokens):
    global _thinking_config_supported

    url = f"{GEMINI_API_URL}/{config.GEMINI_MODEL}:generateContent"
    headers = {
        "x-goog-api-key": config.GEMINI_API_KEY,
        "content-type": "application/json",
    }

    # 503 (model overloaded) and 429 (rate limited) are routine on the free
    # tier and usually clear within a second or two, so retry rather than
    # failing the user's request on the first attempt.
    last_error = None
    for attempt in range(GEMINI_MAX_ATTEMPTS):
        payload = _gemini_payload(parts, max_tokens, _thinking_config_supported)

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=config.AI_TIMEOUT)
        except requests.RequestException as exc:
            last_error = AIServiceError(f"AI request failed: {exc}")
            time.sleep(GEMINI_BACKOFF_SECONDS * (attempt + 1))
            continue

        if response.status_code == 200:
            return _read_gemini_text(response.json())

        detail = ""
        try:
            detail = response.json().get("error", {}).get("message", "")
        except ValueError:
            detail = response.text[:200]

        # The model refused one of our generation options. Drop the optional
        # one and try again immediately - this is what makes the same code
        # work across Gemini 2.5 and 3.x without the user choosing a setting.
        if response.status_code == 400 and _thinking_config_supported:
            _thinking_config_supported = False
            continue

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


def _read_gemini_text(data):
    """Pulls the text out of a Gemini reply, and explains itself when there
    isn't any - an empty candidate is otherwise indistinguishable from a
    malformed one."""
    candidates = data.get("candidates") or []
    if not candidates:
        blocked = (data.get("promptFeedback") or {}).get("blockReason")
        if blocked:
            raise AIServiceError(f"The AI declined to process this input ({blocked}).")
        raise AIServiceError("The AI returned an empty response.")

    candidate = candidates[0]
    finish_reason = candidate.get("finishReason")
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "\n".join(part.get("text", "") for part in parts if part.get("text")).strip()

    if text:
        return text

    if finish_reason == "MAX_TOKENS":
        raise AIServiceError(
            "The AI ran out of room before answering. Try a different GEMINI_MODEL "
            "(see list_gemini_models.py)."
        )
    if finish_reason in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"):
        raise AIServiceError("The AI declined to process this image or page.")

    raise AIServiceError(f"The AI returned no text (finish reason: {finish_reason or 'unknown'}).")


def _complete_multi(prompt, images, max_tokens=800):
    """Like `_complete`, but carries several images in one request - which is
    what lets a single call both read the page and choose between its photos."""
    if config.AI_PROVIDER == "gemini":
        parts = [
            {"inline_data": {"mime_type": media_type or "image/jpeg",
                             "data": base64.b64encode(data).decode("utf-8")}}
            for data, media_type in images
        ]
        parts.append({"text": prompt})
        return _complete_gemini_parts(parts, max_tokens)

    if config.AI_PROVIDER == "anthropic":
        content = [
            {"type": "image",
             "source": {"type": "base64", "media_type": media_type or "image/jpeg",
                        "data": base64.b64encode(data).decode("utf-8")}}
            for data, media_type in images
        ]
        content.append({"type": "text", "text": prompt})
        return _complete_anthropic_content(content, max_tokens)

    raise AIServiceError("No AI provider is configured.")


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
    snippet = cleaned[:120].replace("\n", " ")
    raise AIServiceError(f"The AI response could not be read. It returned: {snippet or '(nothing)'}")


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
# 1. Photo -> detected garments with locations
# ---------------------------------------------------------------------------

GARMENT_TYPES = (
    "t-shirt, shirt, blouse, hoodie, sweatshirt, sweater, cardigan, jacket, coat, "
    "blazer, vest, trousers, jeans, shorts, skirt, dress, jumpsuit, shoes, boots, "
    "trainers, sandals, bag, hat, scarf, belt, other"
)

DETECTION_SCHEMA = """Respond with ONLY a JSON object (no prose, no markdown fences):
{
  "usable": true | false,
  "reason": "<if usable is false, one short sentence explaining why>",
  "image_kind": "product_photo" | "worn" | "flat_lay" | "screenshot" | "unclear",
  "items": [
    {
      "garment_type": "<one of: %s>",
      "category": "top" | "bottom" | "outerwear" | "footwear" | "accessory",
      "color": "<main colour, one or two words>",
      "style": "<one of: Casual, Streetwear, Business, Minimalist, Sport, Formal>",
      "warmth_level": <integer 1-5, 1 = very light/summer, 5 = very warm/winter>,
      "description": "<one short sentence describing this garment>",
      "confidence": <0.0-1.0, how certain you are about this garment>,
      "is_primary": true | false,
      "bounding_box": {
        "x_min": <0.0-1.0>, "y_min": <0.0-1.0>,
        "x_max": <0.0-1.0>, "y_max": <0.0-1.0>
      }
    }
  ]
}""" % GARMENT_TYPES

DETECTION_PROMPT = """Identify every distinct item of clothing in this image.

The image may be a plain product photo, a garment laid flat, a photo of a person
wearing several things, or a screenshot of a shop or social media page.

For each garment, give a bounding box around THAT GARMENT ONLY, as fractions of
the image width and height, where 0,0 is the top-left corner.

Rules for the boxes:
- Box the garment, not the person wearing it. A t-shirt box stops at the
  shoulders and the hem; it must not include the head, the legs, or the trousers.
  Trousers are boxed from the waistband to the hems: no torso, no arms, no shoes.
  Shoes are boxed at the feet only.
- A box that covers most of the image is wrong whenever a person is visible -
  that is a box around the person. Tighten it to the garment.
- If the image is a screenshot, box only the garment in the photograph. Exclude
  page furniture: menus, prices, buttons, titles, comments, other products.
- Mark the garment the image is most obviously about as "is_primary": true.
  Exactly one item may be primary.
- List at most %d garments, most prominent first.

Set "usable": false if there is no clothing in the image, if the clothing is
almost entirely hidden, or if the image is too unclear to identify anything.

%s"""

# Below this the model is guessing rather than recognising.
MIN_DETECTION_CONFIDENCE = 0.35


def _normalize_box(raw):
    """Accepts the several shapes a model may answer with.

    Gemini's own convention is a flat array in [y_min, x_min, y_max, x_max]
    order scaled 0-1000, and it falls back to that even when asked for named
    keys. Reading only the named form meant a perfectly good box was silently
    discarded and nothing ever got cropped.
    """
    if raw is None:
        return None

    values = None

    if isinstance(raw, dict):
        # Named keys, in any of the spellings models produce.
        aliases = {
            "x_min": ("x_min", "xmin", "left", "x1"),
            "y_min": ("y_min", "ymin", "top", "y1"),
            "x_max": ("x_max", "xmax", "right", "x2"),
            "y_max": ("y_max", "ymax", "bottom", "y2"),
        }
        named = {}
        for key, options in aliases.items():
            for option in options:
                if option in raw:
                    named[key] = raw[option]
                    break
        if len(named) == 4:
            try:
                values = [float(named["x_min"]), float(named["y_min"]),
                          float(named["x_max"]), float(named["y_max"])]
            except (TypeError, ValueError):
                return None
        else:
            # Some replies nest the array under box_2d or similar.
            for key in ("box_2d", "box", "bbox", "coordinates"):
                if isinstance(raw.get(key), (list, tuple)):
                    return _normalize_box(raw[key])
            return None

    elif isinstance(raw, (list, tuple)) and len(raw) == 4:
        try:
            y_min, x_min, y_max, x_max = (float(v) for v in raw)
        except (TypeError, ValueError):
            return None
        values = [x_min, y_min, x_max, y_max]

    else:
        return None

    # Anything above 1 is on the 0-1000 scale.
    if any(v > 1.0 for v in values):
        values = [v / 1000.0 for v in values]

    x_min, y_min, x_max, y_max = (max(0.0, min(1.0, v)) for v in values)
    if x_max <= x_min or y_max <= y_min:
        return None

    return {"x_min": x_min, "y_min": y_min, "x_max": x_max, "y_max": y_max}


def detect_clothing_items(image_bytes, media_type="image/jpeg"):
    """Returns (items, meta).

    Each item carries normalised attributes plus `bounding_box`, `confidence`
    and `is_primary`. The bounding box is what lets the image pipeline cut one
    garment out of a photo containing a whole person or a whole web page.
    """
    if not is_live():
        return [dict(_mock_clothing_attributes(), bounding_box=None,
                     confidence=0.0, is_primary=True, garment_type="t-shirt")], \
               {"image_kind": "unclear", "provider": "mock"}

    prompt = DETECTION_PROMPT % (config.MAX_DETECTED_ITEMS, DETECTION_SCHEMA)
    parsed = _extract_json(
        _complete(prompt, image_bytes=image_bytes, media_type=media_type, max_tokens=1400)
    )

    if not parsed.get("usable", True):
        raise AIServiceError(
            str(parsed.get("reason") or "No clothing could be identified in this image.")
        )

    raw_items = parsed.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        raise AIServiceError("No clothing could be identified in this image.")

    items = []
    for raw in raw_items[:config.MAX_DETECTED_ITEMS]:
        if not isinstance(raw, dict):
            continue
        try:
            confidence = float(raw.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5
        if confidence < MIN_DETECTION_CONFIDENCE:
            continue

        item = _normalize_attributes(raw)
        item["garment_type"] = str(raw.get("garment_type") or "").strip()[:40] or None
        item["bounding_box"] = _normalize_box(raw.get("bounding_box"))
        item["confidence"] = round(max(0.0, min(1.0, confidence)), 2)
        item["is_primary"] = bool(raw.get("is_primary"))
        items.append(item)

    if not items:
        raise AIServiceError(
            "Nothing in this image could be identified confidently enough to add. "
            "Try a clearer photo of the item."
        )

    # Exactly one primary, and it leads the list.
    if not any(item["is_primary"] for item in items):
        items[0]["is_primary"] = True
    items.sort(key=lambda i: (not i["is_primary"], -i["confidence"]))
    for item in items[1:]:
        item["is_primary"] = False

    return items, {
        "image_kind": str(parsed.get("image_kind") or "unclear"),
        "provider": provider(),
    }


def analyze_clothing_photo(image_bytes, media_type="image/jpeg"):
    """Attributes of the single most prominent garment. Kept for callers that
    do not care about the other items in the frame."""
    items, _ = detect_clothing_items(image_bytes, media_type)
    return items[0]


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


IMG_TAG_PATTERN = re.compile(r"<img\s+([^>]+?)/?>", re.IGNORECASE)

# Image URLs anywhere in the document, including inside the JSON blobs that
# galleries are configured with.
IMAGE_URL_PATTERN = re.compile(
    r"""(?:https?:)?//[^\s"'<>\\]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>\\]*)?""",
    re.IGNORECASE,
)

JUNK_IMAGE_WORDS = (
    "logo", "icon", "sprite", "banner", "payment", "flag", "placeholder",
    "loader", "spinner", "avatar", "badge", "pixel", "tracking", "favicon",
    "watermark", "swatch", "thumb-nav", "size-guide",
)


def _looks_like_product_image(url):
    lowered = url.lower()
    if any(word in lowered for word in JUNK_IMAGE_WORDS):
        return False
    return not lowered.endswith((".svg", ".gif"))


def _gallery_images(html, base_url):
    """Every plausible product photo on the page.

    A shop gallery holds several shots of one garment: on a model, and usually
    one laid flat. Scanning only <img> tags misses most of them, because
    galleries are typically configured from a JSON blob inside a <script> and
    rendered by the browser. So the whole document is scanned for image URLs,
    including the escaped ones inside JSON.
    """
    found, seen = [], set()

    def add(candidate):
        resolved = _absolute_url(base_url, candidate)
        if not resolved or not _looks_like_product_image(resolved):
            return
        resolved = _prefer_large_variant(resolved)
        if resolved not in seen:
            seen.add(resolved)
            found.append(resolved)

    for raw_attrs in IMG_TAG_PATTERN.findall(html):
        attrs = {k.lower(): v for k, v in ATTR_PATTERN.findall(raw_attrs)}
        add(attrs.get("src") or attrs.get("data-src") or attrs.get("data-original")
            or (attrs.get("srcset") or "").split(" ")[0])

    # JSON embeds slashes as \/ - unescape before matching.
    for match in IMAGE_URL_PATTERN.findall(html.replace("\\/", "/")):
        add(match)

    return found


CACHE_SIZE_PATTERN = re.compile(r"(/cache/[^/]+/)(\d{2,4})(/)")


def _prefer_large_variant(url):
    """Galleries list thumbnails; the same photo at full size differs only by a
    number in the path. Upgrading it costs nothing and gives the model - and
    the wardrobe tile - something worth looking at."""
    match = CACHE_SIZE_PATTERN.search(url)
    if not match:
        return url
    try:
        size = int(match.group(2))
    except ValueError:
        return url
    if size >= 960:
        return url
    return CACHE_SIZE_PATTERN.sub(lambda m: f"{m.group(1)}960{m.group(3)}", url, count=1)


def _rank_by_product_family(urls, reference):
    """Photos of the same garment share a long path prefix with the main
    image. Ranking by that prefix pushes the other shots of THIS product above
    unrelated pictures elsewhere on the page."""
    if not reference:
        return urls

    def shared_prefix(url):
        limit = min(len(url), len(reference))
        count = 0
        while count < limit and url[count] == reference[count]:
            count += 1
        return count

    return sorted(urls, key=shared_prefix, reverse=True)


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

        raw_image = product.get("image")
        images = raw_image if isinstance(raw_image, list) else [raw_image]
        images = [i.get("url") if isinstance(i, dict) else i for i in images]
        images = [i for i in images if isinstance(i, str)]
        image = images[0] if images else None

        return {
            "name": _clean(product.get("name"), 200),
            "description": _clean(product.get("description"), 800),
            "brand": _clean(brand, 80),
            "color": _clean(product.get("color"), 60),
            "material": _clean(product.get("material"), 80),
            "category": _clean(product.get("category"), 100),
            "image": image,
            "images": images,
        }
    return None


def _absolute_url(base_url, candidate):
    """Stores routinely give image paths as "/img/x.jpg" or "//cdn/x.jpg".
    Taking only the ones already starting with http silently dropped most of
    them, which is why link-added items had no picture."""
    if not candidate:
        return None
    candidate = str(candidate).strip()
    if not candidate:
        return None
    try:
        resolved = urljoin(base_url, candidate)
    except ValueError:
        return None
    return resolved if resolved.startswith(("http://", "https://")) else None


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
        "gallery": _gallery_images(html, safe_url),
        "url": safe_url,
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


def _candidate_images(page, url):
    """Ordered list of plausible product photos, most likely first."""
    product = page.get("product") or {}
    meta = page.get("meta") or {}

    # Ordered by trustworthiness: structured product data first, then the
    # social-preview tags. The gallery is handled separately below, because it
    # is the part that needs ranking - it contains other products too.
    ordered = []
    ordered.extend(product.get("images") or [])
    ordered.extend([meta.get("og:image"), meta.get("twitter:image")])

    seen, resolved = set(), []
    for candidate in ordered:
        absolute = _absolute_url(url, candidate)
        if absolute and absolute not in seen and _looks_like_product_image(absolute):
            seen.add(absolute)
            resolved.append(absolute)

    # The first entry is the main product shot; anything sharing its path is
    # another photo of the same garment, so those come next.
    reference = resolved[0] if resolved else None
    gallery = _rank_by_product_family(
        [u for u in (page.get("gallery") or []) if u not in seen], reference
    )
    return (resolved + gallery)[:config.MAX_PRODUCT_IMAGES * 2]


PHOTO_CLASSIFIER_PROMPT = """You are shown %d photos from one clothing product page, in order.

For each photo, answer two things:

1. "person_visible": true if ANY part of a human body appears - face, hair, neck,
   torso, arm, hand, leg or foot. Cropped body parts count: a photo showing only
   someone's legs in the trousers has a person visible. A photo of the garment
   laid flat, hanging, or floating against a plain backdrop has no person.

2. "garment_coverage": roughly how much of the frame the garment itself fills,
   from 0.0 to 1.0.

Respond with ONLY this JSON, no prose and no markdown fences:
{"photos": [{"index": 1, "person_visible": true, "garment_coverage": 0.4}, ...]}

Include one entry per attached photo, in the same order."""


def _classify_photos(downloaded):
    """Asks one narrow question about each photo: is a person in it?

    This is deliberately a separate call from attribute extraction. Asking a
    single request to read the page, extract attributes, choose a photo, judge
    whether a person is present and locate the garment produced a good answer
    to the first two and a careless one to the rest. One question at a time is
    answered far more reliably, and the choice itself is then made in code.
    """
    if len(downloaded) < 2:
        return None

    prompt = PHOTO_CLASSIFIER_PROMPT % len(downloaded)
    try:
        parsed = _extract_json(
            _complete_multi(prompt, [(b, m) for _u, b, m in downloaded], max_tokens=600)
        )
    except AIServiceError as exc:
        log.info("Photo classification failed (%s); falling back to page order", exc)
        return None

    entries = parsed.get("photos")
    if not isinstance(entries, list) or not entries:
        return None

    verdicts = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        try:
            index = int(entry.get("index", 0)) - 1
        except (TypeError, ValueError):
            continue
        if not 0 <= index < len(downloaded):
            continue
        try:
            coverage = float(entry.get("garment_coverage", 0.5))
        except (TypeError, ValueError):
            coverage = 0.5
        verdicts[index] = {
            "person_visible": bool(entry.get("person_visible", True)),
            "garment_coverage": max(0.0, min(1.0, coverage)),
        }

    return verdicts or None


def _choose_photo(downloaded, verdicts):
    """Applies the rule in code rather than leaving it to the model:
    a photo without a person wins; failing that, the one showing most garment.

    Returns (index, person_visible).
    """
    if not verdicts:
        return 0, True

    clean = [i for i, v in verdicts.items() if not v["person_visible"]]
    if clean:
        best = max(clean, key=lambda i: verdicts[i]["garment_coverage"])
        return best, False

    best = max(verdicts, key=lambda i: verdicts[i]["garment_coverage"])
    return best, True


def parse_product_link(url):
    """Returns (attributes, image_bytes, media_type).

    Shop galleries hold several photos of the same garment: one on a model,
    usually one laid flat against white. The flat one makes the better
    wardrobe tile, so several are downloaded and the model is asked which
    shows the garment on its own - rather than taking og:image, which is the
    social-preview shot and nearly always the model.
    """
    page = fetch_product_page(url)
    candidates = _candidate_images(page, url)

    if not is_live():
        return (
            _mock_clothing_attributes(source_link=url,
                                      image_url=candidates[0] if candidates else None),
            None,
            None,
        )

    # Download a handful; small failures are silently skipped.
    downloaded = []
    for image_url in candidates:
        if len(downloaded) >= config.MAX_PRODUCT_IMAGES:
            break
        image_bytes, media_type = _fetch_image(image_url)
        if image_bytes:
            downloaded.append((image_url, image_bytes, media_type))

    log.info(
        "Product page %s: %d candidate image(s), %d downloaded",
        url, len(candidates), len(downloaded),
    )
    for index, (image_url, image_bytes, _type) in enumerate(downloaded, 1):
        log.info("  photo %d: %s (%d KB)", index, image_url, len(image_bytes) // 1024)

    summary = _summarize_page(page)
    if not summary and not downloaded:
        raise AIServiceError(
            "No product details could be read from that page. The store may render its "
            "content with JavaScript or block automated access - try adding the item by photo."
        )

    # Choose the photo first, with a dedicated call, then describe only that one.
    verdicts = _classify_photos(downloaded)
    if downloaded:
        preselected, preselected_has_person = _choose_photo(downloaded, verdicts)
        log.info(
            "Photo verdicts: %s -> chose photo %d (person visible: %s)",
            {i + 1: v for i, v in (verdicts or {}).items()},
            preselected + 1, preselected_has_person,
        )
        downloaded = [downloaded[preselected]]
    else:
        preselected_has_person = False

    parts_note = ""
    if downloaded:
        parts_note = (
            "\n\nThe product photo is attached.\n"
            '\nONE MORE FIELD IS REQUIRED: "bounding_box", the box around THIS GARMENT '
            "within the photo, as fractions of its width and height, 0,0 being the "
            "top-left corner:\n"
            '   {"x_min": <0-1>, "y_min": <0-1>, "x_max": <0-1>, "y_max": <0-1>}\n'
            "Box the garment only - for trousers that means from the waistband to the "
            "hems, excluding the torso, the arms, the shoes and any other clothing. If "
            "the garment is alone against a plain background, box the whole garment with "
            "a little room around it.\n"
        )

    prompt = (
        "Below is information about a clothing item from an online store. "
        "Extract the item's attributes.\n\n"
        + CLOTHING_ATTRIBUTES_SCHEMA
        + parts_note
        + (f"\n\nPRODUCT INFORMATION:\n{summary}" if summary else "")
    )

    parsed = _extract_json(
        _complete_multi(prompt, [(b, m) for _u, b, m in downloaded], max_tokens=900)
    )

    chosen_url, chosen_bytes, chosen_type = (
        downloaded[0] if downloaded else (None, None, None)
    )

    log.info("  raw box from model: %r -> parsed: %r",
             parsed.get("bounding_box"), _normalize_box(parsed.get("bounding_box")))

    attributes = _normalize_attributes(parsed, source_link=url, image_url=chosen_url)
    attributes["bounding_box"] = _normalize_box(parsed.get("bounding_box"))
    # A flat packshot needs no cutting out; a worn shot does.
    attributes["photo_has_person"] = preselected_has_person
    return attributes, chosen_bytes, chosen_type


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

    The deterministic engine builds and ranks real outfits first; the model
    only chooses between good options and explains the choice. Never raises on
    model failure - it falls back to the top-scoring outfit.
    """
    recently_used_ids = set(recently_used_ids or [])
    penalties = dict(disliked_counts or {})
    for item_id in recently_used_ids:
        penalties[item_id] = penalties.get(item_id, 0) + 1

    candidates = select_candidates(wardrobe_items, weather, penalties)
    if not candidates:
        candidates = list(wardrobe_items)

    warmth_range = warmth_range_for(weather)
    shortlist = compatibility.build_outfits(
        candidates,
        warmth_range=warmth_range,
        preference=style_preference,
        penalties=penalties,
        want_outerwear=needs_outerwear(weather),
        weather=weather,
        limit=5,
    )

    if not shortlist:
        return {
            "item_ids": assemble_outfit(candidates, weather),
            "reasoning": _fallback_reasoning(weather, is_live()),
            "styling_tip": None,
            "generated_by": "mock",
        }

    best = shortlist[0]
    fallback = {
        "item_ids": [item["id"] for item in best["items"]],
        "reasoning": f"{compatibility.describe(best)} {_fallback_reasoning(weather, is_live())}",
        "styling_tip": None,
        "generated_by": "mock",
    }

    if not is_live():
        return fallback

    valid_ids = {item["id"] for item in candidates}
    options = []
    for index, entry in enumerate(shortlist, start=1):
        options.append({
            "option": index,
            "item_ids": [item["id"] for item in entry["items"]],
            "match_score": entry["score"],
            "reads_as": f"{entry['notes']['style']}, {entry['notes']['color']}",
            "pieces": [
                f"{item['color']} {item['category']} ({item['style']}, warmth {item['warmth_level']})"
                for item in entry["items"]
            ],
        })

    event_line = (
        f"Occasion: {event['name']} - dress code: {event['dress_code_description']}"
        if event else "Occasion: everyday, no specific event"
    )

    prompt = f"""You are a personal stylist. Below are outfit options already assembled from \
this person's wardrobe and pre-scored for colour harmony, style coherence and today's weather.

{json.dumps(options, ensure_ascii=False, indent=1)}

Weather: {weather['temp_c']}C, feels like {weather['feels_like_c']}C, {weather['description']}, \
rain expected: {weather['rain_probability']}, wind {weather['wind_speed_ms']} m/s.
Preferred style: {style_preference}
{event_line}

Pick the option that best fits the occasion and the weather. Usually that is the \
highest-scoring one, but choose a different option if the occasion calls for it.

Respond with ONLY a JSON object (no prose, no markdown fences):
{{
  "item_ids": [<the item_ids of the option you chose, unchanged>],
  "reasoning": "<1-2 warm, specific sentences on why this works today>",
  "styling_tip": "<one short, concrete styling tip - how to wear it, not what it is>"
}}"""

    try:
        parsed = _extract_json(_complete(prompt, max_tokens=900))
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