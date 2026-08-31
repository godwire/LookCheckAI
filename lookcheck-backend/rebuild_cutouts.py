"""
Repairs cut-outs saved before they were trimmed, and fills in the join
measurements behind them.

Early cut-outs were written as padded 800x800 squares. Anything measuring
them sees every garment as 1:1, so a jacket, a pair of trousers and a pair of
shoes all come out the same shape - which is exactly what the outfit
composition was doing.

Nothing is re-photographed and nothing is sent anywhere: the stored PNG
already carries the garment's alpha, so trimming it to its own content
recovers the true proportions. Joins are then measured from the trimmed
image.

Usage, with the backend's virtual environment active:

    python rebuild_cutouts.py            # show what would change
    python rebuild_cutouts.py --apply    # do it
"""

import io
import json
import os
import sys

from PIL import Image

import config
import database
from services import image_service

APPLY = "--apply" in sys.argv


def local_path(url):
    """/media/7/abc.png -> the file on disk, or None if it isn't ours."""
    if not url or not url.startswith("/media/"):
        return None
    relative = url[len("/media/"):]
    if ".." in relative:
        return None
    path = os.path.join(config.MEDIA_ROOT, *relative.split("/"))
    return path if os.path.isfile(path) else None


def main():
    with database.db_cursor(commit=False) as cur:
        cur.execute(
            database._q(
                "SELECT id, user_id, category, color, cutout_url, cutout_joins "
                "FROM clothes WHERE cutout_url IS NOT NULL"
            )
        )
        items = database._all(cur)

    if not items:
        print("No cut-outs to look at. Add a few pieces first.")
        return

    print(f"{len(items)} cut-out(s) found\n")
    repaired = measured = skipped = 0

    for item in items:
        label = f"#{item['id']} {item['color']} {item['category']}"
        path = local_path(item["cutout_url"])
        if not path:
            print(f"  {label:34} file missing, skipped")
            skipped += 1
            continue

        image = Image.open(path).convert("RGBA")
        before = image.size
        trimmed = image.crop(image.getchannel("A").getbbox() or (0, 0, *image.size))

        needs_trim = trimmed.size != before
        joins = image_service.measure_joins(trimmed)
        try:
            recorded = json.loads(item["cutout_joins"]) if item["cutout_joins"] else {}
        except ValueError:
            recorded = {}
        # Offsets were added after the first version of the measurements, so a
        # record without them is out of date even though it is not empty.
        needs_joins = "top_offset" not in recorded

        if not needs_trim and not needs_joins:
            print(f"  {label:34} already fine")
            continue

        note = []
        if needs_trim:
            note.append(f"{before[0]}x{before[1]} -> {trimmed.size[0]}x{trimmed.size[1]}")
            repaired += 1
        if needs_joins:
            note.append(
                f"joins {joins['top']:.2f}/{joins['bottom']:.2f} "
                f"offset {joins['top_offset']:+.2f}/{joins['bottom_offset']:+.2f}"
            )
            measured += 1

        print(f"  {label:34} {', '.join(note)}")

        if not APPLY:
            continue

        new_url = item["cutout_url"]
        if needs_trim:
            buffer = io.BytesIO()
            trimmed.save(buffer, format="PNG", optimize=True)

            # Saved under a fresh name rather than over the old file. The app
            # caches images by URL, so rewriting a file in place leaves it
            # showing the stale square one - the repair would look like it had
            # done nothing at all.
            new_url = image_service.save(item["user_id"], buffer.getvalue(), suffix="png")

        with database.db_cursor() as cur:
            cur.execute(
                database._q(
                    "UPDATE clothes SET cutout_url = ?, cutout_joins = ? WHERE id = ?"
                ),
                (new_url, json.dumps(joins), item["id"]),
            )

        if new_url != item["cutout_url"]:
            os.remove(path)

    print(f"\n{repaired} cut-out(s) trimmed, {measured} measured, {skipped} skipped")
    if not APPLY:
        print("\nThis was a dry run. Re-run with --apply to write the changes.")


if __name__ == "__main__":
    main()