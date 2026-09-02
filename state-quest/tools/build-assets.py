"""
============================================================
BUILD-ASSETS  --  a one-time tool, NOT part of the game
============================================================

You normally never need to run this. It has already
been run, and the file it makes is sitting in
assets/sprites/sprites-inline.js.

You only need it again if you want to change the artwork.

WHAT IT DOES
  Reads the Kenney art pack zip sitting next to this file,
  pulls out the handful of pictures the running game needs,
  and writes them into ONE JavaScript file.

WHY A JAVASCRIPT FILE, AGAIN
  Same reason as the map and the state list. A page opened
  straight from a folder (file://) is not allowed to load its
  own picture files into the game's drawing engine - the
  browser treats them as coming from a stranger and blocks
  them. Pictures written into a .js file are part of the page
  itself, so they always work.

  This is not a small detail: loose .png files APPEAR to work
  when a programmer tests through their tools, and then fail
  the moment you double-click index.html. Hence this tool.

WHERE THE ART COMES FROM
  Kenney's "Jumper Pack" (kenney.nl), CC0 / public domain.
  Free to use, no credit required.

IF YOU SWAP IN A DIFFERENT PACK
  Drop the new zip in this folder and run this tool. It looks
  for each picture by a list of likely names, prints what it
  picked, and stops with the zip's full contents listed if it
  cannot find something. Then adjust WANTED below.

Run it with:   python tools/build-assets.py
============================================================
"""

import base64
import io
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
OUT_JS = PROJECT / "assets" / "sprites" / "sprites-inline.js"
LISTING = HERE / "zip-contents.txt"

# Which pictures the game needs, and what they might be called.
# The names are tried in order, first match wins. A slot marked
# optional is allowed to come up empty.
WANTED = [
    # key          candidate file names (matched on the end of the path)
    ("player",     ["bunny1_stand.png", "p1_stand.png", "alienBlue_stand.png",
                    "player_stand.png"],                        False),
    ("playerJump", ["bunny1_jump.png", "p1_jump.png",
                    "alienBlue_jump.png"],                      True),
    ("playerHurt", ["bunny1_hurt.png", "p1_hurt.png",
                    "alienBlue_hit.png"],                       True),
    ("coin",       ["gold_1.png", "coin_gold.png", "coinGold.png",
                    "coin.png"],                                False),
    ("obstacle",   ["cactus.png", "boxCrate.png", "crateWood.png",
                    "spikes_top.png", "box.png"],               False),
    ("ledge",      ["ground_grass_small.png", "grassHalfMid.png",
                    "grassHalf.png", "platform.png"],           False),
    ("grass1",     ["grass1.png", "grass.png"],                 True),
    ("grass2",     ["grass2.png"],                              True),
]


def fail(message, listing=None):
    """Stop with a clear reason. Nothing gets written."""
    print("\nBUILD FAILED: " + message)
    if listing:
        print("\nWhat is actually in the zip (also saved to "
              + LISTING.name + "):")
        for name in listing[:60]:
            print("   " + name)
        if len(listing) > 60:
            print("   ... and " + str(len(listing) - 60) + " more")
    print("\nNo files were changed.")
    sys.exit(1)


def find_zip():
    """The art pack zip sitting next to this script."""
    zips = sorted(HERE.glob("*.zip"))
    if not zips:
        fail("no .zip found in " + str(HERE)
             + "\n  Download an art pack from kenney.nl and drop the zip in there.")

    # Prefer a jumper/platformer pack if several are present.
    for preferred in ("jumper", "platformer"):
        for path in zips:
            if preferred in path.name.lower() and "1-bit" not in path.name.lower():
                return path
    return zips[0]


def pick_files(archive, names):
    """Match each wanted picture to a real file in the zip."""
    chosen = {}
    missing = []

    for key, candidates, optional in WANTED:
        found = None
        for candidate in candidates:
            for name in names:
                if name.lower().endswith("/" + candidate.lower()) \
                        or name.lower() == candidate.lower():
                    found = name
                    break
            if found:
                break

        if found:
            chosen[key] = found
            print("   {:<11} {}".format(key, found))
        elif optional:
            print("   {:<11} (not found - that is allowed)".format(key))
        else:
            missing.append(key + " (looked for: " + ", ".join(candidates) + ")")

    if missing:
        fail("could not find these pictures in the zip:\n  - "
             + "\n  - ".join(missing), names)

    return chosen


def as_data_uri(raw):
    """Turn the bytes of a .png into something a web page can draw."""
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def main():
    zip_path = find_zip()
    print("Reading " + zip_path.name)

    try:
        archive = zipfile.ZipFile(zip_path)
    except Exception as error:                      # noqa: BLE001
        fail("could not open the zip: " + str(error))

    names = [n for n in archive.namelist() if not n.endswith("/")]

    # Always leave a record of what was in there, so picking a
    # different picture later is a matter of reading a list.
    LISTING.write_text("\n".join(sorted(names)), encoding="utf-8")
    print("Wrote " + LISTING.name + " (" + str(len(names)) + " files listed)")

    print("Picking out the pictures the game needs:")
    chosen = pick_files(archive, names)

    # --- read them, and check they really are pictures ---
    art = {}
    for key, name in chosen.items():
        raw = archive.read(name)
        if raw[:8] != b"\x89PNG\r\n\x1a\n":
            fail(name + " is not a PNG image.")
        art[key] = as_data_uri(raw)

    # --- licence, copied in so the credit travels with the art ---
    licence = "Kenney (kenney.nl), CC0 / public domain - no credit required."
    for name in names:
        if name.lower().endswith("license.txt"):
            text = archive.read(name).decode("utf-8", "replace")
            if "CC0" in text or "Creative Commons Zero" in text:
                break
    else:
        print("   NOTE: no CC0 licence file found in the zip - please check it.")

    # --- write the one file the game loads ---
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "/* ============================================================",
        "   SPRITES  --  the pictures for the running game",
        "   ============================================================",
        "",
        "   Do not hand-edit this file. It is made by",
        "   tools/build-assets.py from the art pack zip in tools/.",
        "",
        "   Why the pictures are inside a JavaScript file: a page opened",
        "   from a folder (file://) cannot load its own .png files into",
        "   the game's drawing engine - the browser treats them as coming",
        "   from a stranger and blocks them. Written in here they are part",
        "   of the page, so they always work. Same trick as the map.",
        "",
        "   Art: " + licence,
        "   Source zip: " + zip_path.name,
        "   ============================================================ */",
        "",
        "const SPRITE_ART = {",
    ]

    for key in [k for k, _, _ in WANTED if k in art]:
        lines.append('  ' + key + ': "' + art[key] + '",')

    lines[-1] = lines[-1].rstrip(",")       # no trailing comma
    lines.append("};")
    lines.append("")

    OUT_JS.write_text("\n".join(lines), encoding="utf-8")

    size_kb = len(OUT_JS.read_bytes()) // 1024
    print("\nWrote " + OUT_JS.name + "  (" + str(size_kb) + " KB, "
          + str(len(art)) + " pictures)")
    print("Done. Refresh the game to see the new art.")


if __name__ == "__main__":
    main()
