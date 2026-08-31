"""
Clothing image processing.

Turns whatever the user uploaded - a mirror selfie, a shop screenshot, a
product photo - into a uniform catalogue tile showing one garment on a clean
ground.

The pipeline:

    load and validate
        -> crop to the garment's bounding box (supplied by the vision model)
        -> remove the background
        -> trim to the remaining subject
        -> pad proportionally to the object's own size
        -> centre on a square canvas
        -> resize to one fixed output size
        -> quality check
        -> save

Two deliberate limits, stated plainly:

Background removal uses a general subject-segmentation model (u2netp, 4.5MB),
not a garment-specific one. It separates subject from background; it does not
know a t-shirt from the arms inside it. Cropping to the garment box *before*
segmentation is what makes this work on photos of people - the crop removes
the head and legs, and segmentation then removes the room. Occasionally a
sliver of arm survives. A garment-specific segmentation model would fix that
but needs roughly a hundred times the memory.

Quality is checked, not assumed. If the result is a near-empty frame, a solid
block of colour, or a subject filling the entire canvas edge to edge, it is
rejected rather than saved - a bad tile is worse than an honest error.
"""

import hashlib
import io
import os
import time

from PIL import Image, ImageOps

import config

try:
    from rembg import new_session, remove as rembg_remove
    REMBG_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    REMBG_AVAILABLE = False

_session = None
_session_lock_owner = None


class ImageProcessingError(Exception):
    """Raised with a message intended for the user."""


# ---------------------------------------------------------------------------
# Loading and validation
# ---------------------------------------------------------------------------

def load_image(image_bytes):
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
    except Exception:
        raise ImageProcessingError("That file could not be read as an image.")

    # Phone photos carry rotation in EXIF; without this a portrait shot is
    # processed sideways and every downstream measurement is wrong.
    image = ImageOps.exif_transpose(image)

    if image.width < config.MIN_SOURCE_PX or image.height < config.MIN_SOURCE_PX:
        raise ImageProcessingError(
            f"That image is too small to work with "
            f"(needs to be at least {config.MIN_SOURCE_PX}px on each side)."
        )

    return image.convert("RGBA")


# ---------------------------------------------------------------------------
# Cropping to the detected garment
# ---------------------------------------------------------------------------

def crop_to_box(image, box, expand=0.06):
    """Crops to a normalised box, with a small proportional margin.

    `box` is {"x_min","y_min","x_max","y_max"} in 0-1 coordinates, as returned
    by the vision model. Values are clamped and sanity-checked: a model that
    returns a degenerate or inverted box should not take the pipeline down
    with it.
    """
    if not box:
        return image

    try:
        x0 = float(box["x_min"]); y0 = float(box["y_min"])
        x1 = float(box["x_max"]); y1 = float(box["y_max"])
    except (KeyError, TypeError, ValueError):
        return image

    x0, x1 = sorted((max(0.0, min(1.0, x0)), max(0.0, min(1.0, x1))))
    y0, y1 = sorted((max(0.0, min(1.0, y0)), max(0.0, min(1.0, y1))))

    # A box covering almost nothing, or almost everything, tells us nothing.
    if (x1 - x0) < 0.04 or (y1 - y0) < 0.04:
        return image
    if (x1 - x0) > 0.97 and (y1 - y0) > 0.97:
        return image

    margin_x = (x1 - x0) * expand
    margin_y = (y1 - y0) * expand
    left = max(0.0, x0 - margin_x) * image.width
    top = max(0.0, y0 - margin_y) * image.height
    right = min(1.0, x1 + margin_x) * image.width
    bottom = min(1.0, y1 + margin_y) * image.height

    return image.crop((int(left), int(top), int(right), int(bottom)))


# ---------------------------------------------------------------------------
# Background removal
# ---------------------------------------------------------------------------

def _get_session():
    global _session
    if _session is None:
        _session = new_session(config.SEGMENTATION_MODEL)
    return _session


def remove_background(image, force=False):
    """Returns an RGBA image whose alpha isolates the subject.

    Falls back to the untouched image (fully opaque) when rembg is not
    installed or fails - the pipeline continues and simply produces a tile
    with its original ground.
    """
    if not REMBG_AVAILABLE or not (force or config.REMOVE_BACKGROUND):
        return image, False

    try:
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        result = rembg_remove(buffer.getvalue(), session=_get_session())
        cut_out = Image.open(io.BytesIO(result)).convert("RGBA")
    except Exception:
        return image, False

    # If segmentation removed essentially everything, it failed - keep the
    # original rather than saving an empty frame.
    if not cut_out.getchannel("A").getbbox():
        return image, False

    return cut_out, True


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def _content_bbox(image):
    """Bounding box of the visible subject, from alpha where present."""
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box:
        return box
    return (0, 0, image.width, image.height)


def normalize(image):
    """Trim, pad proportionally, centre on a square, resize.

    Padding is a share of the object's own longest edge rather than a fixed
    pixel count, which is what makes a photographed coat and a photographed
    sock end up looking like the same kind of object on the shelf.
    """
    box = _content_bbox(image)
    subject = image.crop(box)

    longest = max(subject.width, subject.height)
    if longest <= 0:
        raise ImageProcessingError("Nothing recognisable was left after processing.")

    padding = int(longest * config.IMAGE_PADDING_RATIO)
    canvas_size = longest + padding * 2

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.paste(
        subject,
        ((canvas_size - subject.width) // 2, (canvas_size - subject.height) // 2),
        subject,
    )

    # Proportions are preserved throughout: the subject is never stretched,
    # only placed on a square and scaled once at the end.
    return canvas.resize((config.IMAGE_SIZE, config.IMAGE_SIZE), Image.LANCZOS)


def flatten(image):
    """Places the cut-out on the app's own surface colour.

    Transparent PNGs would be ideal, but a tile whose ground matches the card
    behind it looks identical and renders faster, and it avoids the case where
    a dark garment disappears into a dark card.
    """
    background = Image.new("RGBA", image.size, config.IMAGE_BACKGROUND)
    return Image.alpha_composite(background, image).convert("RGB")


def measure_joins(image):
    """Where and how wide the garment is at the points where it meets the
    next piece.

    A flat lay reads as an outfit when the pieces connect: the hem of a top
    sits at the waist of the trousers, and the trouser hems sit on the shoes.
    Those join widths are what relate one garment to another - not their
    overall sizes, which is why scaling each piece on its own never made the
    column look like one body.

    Each join carries a horizontal offset as well. Aligning pieces by the
    centre of their bounding box lines up the wrong thing: a pair of trousers
    photographed with the legs swung slightly to one side has its waist off
    the box's centre, so the waist ends up sitting to one side of the hem
    above it. The offset says how far the opaque run at that edge sits from
    the middle, so the pieces can be aligned by the seam instead.

    Measured from the alpha channel, as fractions of the garment's own width.
    """
    alpha = image.getchannel("A")
    width, height = alpha.size
    if width == 0 or height == 0:
        return {"top": 1.0, "bottom": 1.0, "top_offset": 0.0, "bottom_offset": 0.0}

    def band(start, end):
        left, right, widest = None, None, 0
        rows = range(max(0, int(height * start)), max(1, int(height * end)))
        for y in rows:
            box = alpha.crop((0, y, width, y + 1)).getbbox()
            if box and (box[2] - box[0]) > widest:
                widest = box[2] - box[0]
                left, right = box[0], box[2]
        if not widest:
            return 1.0, 0.0
        centre = (left + right) / 2.0
        return widest / float(width), (centre - width / 2.0) / float(width)

    # Just inside the edges: the very first row is often a stray pixel or two.
    top_width, top_offset = band(0.04, 0.12)
    bottom_width, bottom_offset = band(0.88, 0.96)

    return {
        "top": top_width,
        "bottom": bottom_width,
        "top_offset": top_offset,
        "bottom_offset": bottom_offset,
    }


def make_cutout(image):
    """A transparent PNG cropped exactly to the garment.

    Unlike the tile, this carries no padding and is not squared off: anything
    laying garments over one another needs the picture's proportions to be the
    garment's proportions, or it has no way to tell a coat from a pair of
    shoes.
    """
    trimmed = image.crop(_content_bbox(image))

    longest = max(trimmed.width, trimmed.height)
    if longest > config.IMAGE_SIZE:
        scale = config.IMAGE_SIZE / float(longest)
        trimmed = trimmed.resize(
            (max(1, int(trimmed.width * scale)), max(1, int(trimmed.height * scale))),
            Image.LANCZOS,
        )

    buffer = io.BytesIO()
    trimmed.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Quality checks
# ---------------------------------------------------------------------------

def assess(image, had_cutout):
    """Rejects results that would look broken on a card.

    Returns a coverage figure for logging; raises when the tile is unusable.
    """
    alpha = image.getchannel("A") if image.mode == "RGBA" else None

    if alpha is not None and had_cutout:
        histogram = alpha.histogram()
        opaque = sum(histogram[200:])
        coverage = opaque / float(image.width * image.height)

        if coverage < config.MIN_SUBJECT_COVERAGE:
            raise ImageProcessingError(
                "The garment takes up too little of this photo to extract cleanly. "
                "Try a closer shot of the item."
            )

    # A tile with almost no variation is a colour block, not a garment - the
    # exact failure that made cards look like painted squares.
    sample = image.convert("RGB").resize((48, 48))
    pixels = list(sample.getdata())
    unique = len({(r // 16, g // 16, b // 16) for r, g, b in pixels})
    if unique < 4:
        raise ImageProcessingError(
            "This image came out as a flat block of colour rather than a garment. "
            "Try a photo where the item is clearly visible."
        )

    return unique


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def _media_dir(user_id):
    path = os.path.join(config.MEDIA_ROOT, str(user_id))
    os.makedirs(path, exist_ok=True)
    return path


def save(user_id, image_bytes, suffix="jpg"):
    """Writes the tile to disk and returns the URL the client should use.

    Local disk is right for development and wrong for most free hosting, whose
    filesystems are wiped on redeploy. Moving this to object storage means
    replacing this one function.
    """
    digest = hashlib.sha256(image_bytes + str(time.time()).encode()).hexdigest()[:20]
    filename = f"{digest}.{suffix}"

    with open(os.path.join(_media_dir(user_id), filename), "wb") as handle:
        handle.write(image_bytes)

    return f"/media/{user_id}/{filename}"


def delete(image_url):
    """Best-effort cleanup when an item is removed."""
    if not image_url or not image_url.startswith("/media/"):
        return False

    relative = image_url[len("/media/"):]
    if ".." in relative or relative.startswith("/"):
        return False

    path = os.path.join(config.MEDIA_ROOT, *relative.split("/"))
    try:
        os.remove(path)
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def process(image_bytes, box=None, want_cutout=None):
    """Runs the full pipeline. Returns (jpeg_bytes, png_bytes_or_None, meta).

    Two artefacts come out of one pass over the image:

    - a JPEG on the tile ground, which is what a wardrobe card shows;
    - a PNG with transparency, when the garment could actually be separated
      from its background.

    The PNG is what makes an outfit composable: garments can only be laid over
    one another convincingly if each one is cut out. Producing both here means
    the expensive part - segmentation - is paid for once.

    Raises ImageProcessingError with a user-facing message when the result
    would not be worth showing.
    """
    started = time.time()
    source = load_image(image_bytes)

    cropped = crop_to_box(source, box)

    # Cut-outs are wanted for composition even when tiles are left untouched,
    # so this pass can be requested independently of REMOVE_BACKGROUND.
    if want_cutout is None:
        want_cutout = config.MAKE_CUTOUTS

    cut_out, had_cutout = remove_background(cropped, force=want_cutout)
    normalized = normalize(cut_out)
    detail = assess(normalized, had_cutout)

    buffer = io.BytesIO()
    flatten(normalized).save(buffer, format="JPEG", quality=88, optimize=True)

    cutout_bytes = None
    joins = None
    if had_cutout:
        # The cut-out is saved trimmed to the garment, with no padding and no
        # square canvas. Its pixel dimensions are then the garment's own
        # proportions, which is what a layout needs in order to place it -
        # padded to a square, every piece measures 1:1 and gets stretched.
        cutout_bytes = make_cutout(cut_out)
        joins = measure_joins(normalized.crop(_content_bbox(normalized)))

    return buffer.getvalue(), cutout_bytes, {
        "joins": joins,
        "source_size": list(source.size),
        "cropped_to_box": cropped.size != source.size,
        "background_removed": had_cutout,
        "detail_score": detail,
        "output_size": config.IMAGE_SIZE,
        "duration_ms": int((time.time() - started) * 1000),
    }