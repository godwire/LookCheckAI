"""
Outfit compatibility scoring.

This is the deterministic half of the recommendation engine. Weather decides
what is *wearable*; this module decides what actually *goes together* -
colour harmony, style coherence, and formality consistency.

It is pure functions over plain dicts: no AI, no network, no cost. That
matters for three reasons. It runs identically whether or not an API key is
configured, it is testable, and it means the language model is asked to
explain a good outfit rather than to find one - a much easier job to get
right.

Scores are 0.0 - 1.0. Nothing here is a hard veto: a low score demotes a
combination, it does not forbid it, because a wardrobe with four items should
still produce an answer.
"""

import itertools

# ---------------------------------------------------------------------------
# Colour
# ---------------------------------------------------------------------------

# Neutrals are the backbone of an outfit: they combine with anything and with
# each other. Everything else is an "accent" and needs to be rationed.
NEUTRALS = {
    "black", "white", "grey", "gray", "charcoal", "silver", "cream", "ivory",
    "beige", "tan", "khaki", "navy", "denim", "brown", "camel", "taupe",
    "sand", "ecru", "off-white", "offwhite", "stone", "bone", "chocolate",
    "espresso", "graphite", "slate", "oatmeal", "nude",
}

# Accent colours grouped by family. Same-family accents are tonal and read as
# deliberate; accents from different families start to compete.
COLOR_FAMILIES = {
    "red": {"red", "burgundy", "maroon", "wine", "crimson", "scarlet", "cherry", "rust"},
    "orange": {"orange", "coral", "terracotta", "apricot", "amber", "copper", "peach"},
    "yellow": {"yellow", "mustard", "gold", "lemon", "ochre", "honey"},
    "green": {"green", "olive", "emerald", "mint", "sage", "forest", "lime", "moss"},
    "blue": {"blue", "cobalt", "azure", "teal", "turquoise", "indigo", "sky", "petrol"},
    "purple": {"purple", "violet", "lilac", "lavender", "plum", "mauve", "aubergine"},
    "pink": {"pink", "rose", "fuchsia", "magenta", "blush", "salmon"},
}

# Families that sit comfortably next to each other.
FRIENDLY_FAMILIES = {
    frozenset({"red", "orange"}),
    frozenset({"orange", "yellow"}),
    frozenset({"yellow", "green"}),
    frozenset({"green", "blue"}),
    frozenset({"blue", "purple"}),
    frozenset({"purple", "pink"}),
    frozenset({"pink", "red"}),
}


def _words(color):
    return {w.strip("-") for w in str(color or "").lower().replace("/", " ").split()}


def is_neutral(color):
    return bool(_words(color) & NEUTRALS)


def color_family(color):
    """Returns a family key, 'neutral', or None when the colour is unknown."""
    words = _words(color)
    if words & NEUTRALS:
        return "neutral"
    for family, members in COLOR_FAMILIES.items():
        if words & members:
            return family
    return None


def color_score(items):
    """How well a set of garment colours works as one outfit.

    The rule most stylists actually use: build on neutrals, and let at most
    one colour do the talking.
    """
    families = [color_family(item.get("color")) for item in items]
    accents = [f for f in families if f and f != "neutral"]

    if not accents:
        return 1.0, "an all-neutral palette"

    unique = set(accents)
    if len(unique) == 1:
        if len(accents) == 1:
            return 1.0, f"one {accents[0]} accent against neutrals"
        return 0.85, f"a tonal {accents[0]} palette"

    if len(unique) == 2:
        if frozenset(unique) in FRIENDLY_FAMILIES:
            return 0.7, f"{' and '.join(sorted(unique))} sitting next to each other"
        return 0.45, f"{' and '.join(sorted(unique))} competing"

    return 0.2, "several colours competing for attention"


# ---------------------------------------------------------------------------
# Style
# ---------------------------------------------------------------------------

STYLES = ("Casual", "Streetwear", "Business", "Minimalist", "Sport", "Formal")

# How naturally two styles mix in one outfit. 1.0 = same register,
# 0.2 = jarring (a suit jacket with running shoes).
STYLE_AFFINITY = {
    ("Casual", "Casual"): 1.0,
    ("Casual", "Streetwear"): 0.85,
    ("Casual", "Minimalist"): 0.8,
    ("Casual", "Sport"): 0.7,
    ("Casual", "Business"): 0.45,
    ("Casual", "Formal"): 0.25,
    ("Streetwear", "Streetwear"): 1.0,
    ("Streetwear", "Minimalist"): 0.6,
    ("Streetwear", "Sport"): 0.8,
    ("Streetwear", "Business"): 0.3,
    ("Streetwear", "Formal"): 0.2,
    ("Minimalist", "Minimalist"): 1.0,
    ("Minimalist", "Business"): 0.8,
    ("Minimalist", "Sport"): 0.5,
    ("Minimalist", "Formal"): 0.65,
    ("Business", "Business"): 1.0,
    ("Business", "Formal"): 0.85,
    ("Business", "Sport"): 0.2,
    ("Sport", "Sport"): 1.0,
    ("Sport", "Formal"): 0.2,
    ("Formal", "Formal"): 1.0,
}


def style_affinity(a, b):
    return STYLE_AFFINITY.get((a, b)) or STYLE_AFFINITY.get((b, a)) or 0.5


def style_score(items, preference=None):
    """Rewards outfits whose pieces speak the same language, and that lean
    towards the style the person actually chose."""
    styles = [item.get("style") for item in items if item.get("style")]
    if len(styles) < 2:
        coherence = 1.0
    else:
        pairs = list(itertools.combinations(styles, 2))
        coherence = sum(style_affinity(a, b) for a, b in pairs) / len(pairs)

    if not preference or not styles:
        return coherence, _style_note(styles, coherence)

    alignment = sum(style_affinity(style, preference) for style in styles) / len(styles)
    # Coherence matters more than matching the stated preference exactly -
    # a well-put-together outfit in a nearby style still looks right.
    return (coherence * 0.65) + (alignment * 0.35), _style_note(styles, coherence)


def _style_note(styles, coherence):
    unique = sorted(set(styles))
    if not unique:
        return "a mixed look"
    if len(unique) == 1:
        return f"a consistent {unique[0].lower()} look"
    if coherence >= 0.75:
        return f"{unique[0].lower()} with a {unique[-1].lower()} edge"
    return "a deliberate style clash"


# ---------------------------------------------------------------------------
# Warmth
# ---------------------------------------------------------------------------

def warmth_score(items, warmth_range):
    """Penalises pieces that sit outside today's sensible warmth band, so a
    heavy knit does not get picked just because it coordinates nicely.

    Accessories are exempt: a ring is not warm or cold, and judging one on a
    warmth scale only adds noise to the score.
    """
    items = [item for item in items if item.get("category") != "accessory"]
    if not items:
        return 1.0
    low, high = warmth_range
    total = 0.0
    for item in items:
        warmth = item.get("warmth_level") or 3
        if low <= warmth <= high:
            total += 1.0
        else:
            distance = low - warmth if warmth < low else warmth - high
            total += max(0.0, 1.0 - (distance * 0.4))
    return total / len(items)


# ---------------------------------------------------------------------------
# Whole-outfit scoring
# ---------------------------------------------------------------------------

WEIGHTS = {"color": 0.35, "style": 0.35, "warmth": 0.2, "freshness": 0.1}


def score_outfit(items, warmth_range, preference=None, penalties=None):
    """Returns (score, notes) for one candidate outfit."""
    penalties = penalties or {}

    color, color_note = color_score(items)
    style, style_note = style_score(items, preference)
    warmth = warmth_score(items, warmth_range)

    # Recently worn or disliked pieces lose ground to unused ones.
    penalty_total = sum(penalties.get(item["id"], 0) for item in items)
    freshness = max(0.0, 1.0 - (penalty_total * 0.25))

    total = (
        color * WEIGHTS["color"]
        + style * WEIGHTS["style"]
        + warmth * WEIGHTS["warmth"]
        + freshness * WEIGHTS["freshness"]
    )
    return total, {"color": color_note, "style": style_note}


# A garment worn next to the skin against one worn over it. Nothing in the
# data says "t-shirt" or "sweatshirt", but warmth already does: a base layer
# is light, a mid layer is not. Using what is there beats asking the user to
# re-tag a wardrobe.
BASE_LAYER_MAX_WARMTH = 2
MID_LAYER_MIN_WARMTH = 3

# Layering only makes sense when the day is cool enough to want two layers.
LAYERING_MAX_FEELS_LIKE = 19


def wants_layering(weather):
    feels = weather.get("feels_like_c", weather.get("temp_c", 15))
    return feels <= LAYERING_MAX_FEELS_LIKE


def pick_base_layer(tops, worn_top, penalties=None):
    """The lighter top to wear underneath a heavier one.

    Returns None when the chosen top is itself light, or when nothing lighter
    is available - a t-shirt under a t-shirt is not an outfit.
    """
    if (worn_top.get("warmth_level") or 3) < MID_LAYER_MIN_WARMTH:
        return None

    penalties = penalties or {}
    candidates = [
        item for item in tops
        if item["id"] != worn_top["id"]
        and (item.get("warmth_level") or 3) <= BASE_LAYER_MAX_WARMTH
    ]
    if not candidates:
        return None

    # A base layer is mostly hidden, so it is chosen for being unobtrusive:
    # neutral first, then whatever has been worn least.
    candidates.sort(
        key=lambda item: (
            0 if is_neutral(item.get("color")) else 1,
            penalties.get(item["id"], 0),
        )
    )
    return candidates[0]


def pick_accessory(accessories, outfit_items, penalties=None):
    """One accessory, chosen so it does not fight the outfit's colours."""
    if not accessories:
        return None

    penalties = penalties or {}
    scored = []
    for item in accessories:
        score, _notes = score_outfit(
            outfit_items + [item], (1, 5), preference=None, penalties=penalties
        )
        scored.append((score, penalties.get(item["id"], 0), item))

    scored.sort(key=lambda entry: (-entry[0], entry[1]))
    return scored[0][2]


def build_outfits(candidates, warmth_range, preference=None, penalties=None,
                  want_outerwear=False, limit=5, per_category=6,
                  weather=None, with_accessory=True):
    """Enumerates plausible outfits from the candidate pool and returns the
    best ones, highest score first.

    Each outfit is one top, one bottom, footwear if available, plus outerwear
    when the weather calls for it. On a cool day a lighter top may be added
    underneath, and an accessory alongside. The pool is capped per category so
    the combinatorics stay small even for a large wardrobe.
    """
    by_category = {}
    for item in candidates:
        by_category.setdefault(item["category"], []).append(item)

    def pool(category):
        items = by_category.get(category, [])
        items = sorted(items, key=lambda i: (penalties or {}).get(i["id"], 0))
        return items[:per_category]

    tops = pool("top") or [None]
    bottoms = pool("bottom") or [None]
    shoes = pool("footwear") or [None]
    outer = (pool("outerwear") or [None]) if want_outerwear else [None]
    accessories = pool("accessory")

    layering = wants_layering(weather or {})

    all_tops = by_category.get("top", [])
    mid_layers = [i for i in all_tops if (i.get("warmth_level") or 3) >= MID_LAYER_MIN_WARMTH]
    base_layers = [i for i in all_tops if (i.get("warmth_level") or 3) <= BASE_LAYER_MAX_WARMTH]

    # On a cool day, wearing the mid layer over a lighter one is simply how
    # people dress - so when the wardrobe holds both, the outer of the two
    # leads and the lighter one goes underneath. Scoring alone would not get
    # there: a t-shirt on its own scores perfectly well, it is just not what
    # anyone would wear in ten degrees.
    if layering and mid_layers and base_layers:
        tops = sorted(mid_layers, key=lambda i: (penalties or {}).get(i["id"], 0))[:per_category]

    scored = []
    for combo in itertools.product(tops, bottoms, shoes, outer):
        items = [item for item in combo if item]
        if not items:
            continue

        worn_top = combo[0]
        if layering and worn_top:
            base = pick_base_layer(by_category.get("top", []), worn_top, penalties)
            if base:
                # The base layer sits first: the composition reads the list in
                # the order the clothes go on.
                items = [base] + items

        if with_accessory and accessories:
            accessory = pick_accessory(accessories, items, penalties)
            if accessory:
                items = items + [accessory]

        score, notes = score_outfit(items, warmth_range, preference, penalties)
        scored.append({"items": items, "score": round(score, 3), "notes": notes})

    if not scored:
        return []

    scored.sort(key=lambda entry: entry["score"], reverse=True)

    # Avoid handing back five near-identical outfits: require each one to
    # differ from those already chosen by at least one garment.
    chosen = []
    for entry in scored:
        ids = {item["id"] for item in entry["items"]}
        if all(len(ids ^ {i["id"] for i in picked["items"]}) >= 2 for picked in chosen):
            chosen.append(entry)
        if len(chosen) >= limit:
            break

    return chosen or scored[:limit]


def describe(entry):
    """Short, human explanation used when no language model is available."""
    notes = entry["notes"]
    return f"{notes['style'].capitalize()}, built on {notes['color']}."