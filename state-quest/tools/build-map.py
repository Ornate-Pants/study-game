"""
============================================================
BUILD-MAP  --  a one-time tool, NOT part of the game
============================================================

Scott: you never need to run this. It has already been run,
and the two files it makes are sitting in assets/map/.
It lives here so that IF the map ever needs rebuilding, the
exact steps are written down instead of remembered.

What it does:
  1. Gets the blank US map SVG from Wikimedia Commons
     ("Blank US Map (states only)" by Heitordp, CC0 / public
     domain, no credit required). It saves a copy next to
     this script, so re-runs work with no internet.
  2. Cleans it up for this game (details below).
  3. Checks its own work against data/states.js and REFUSES
     to write anything if a single state is wrong.
  4. Writes assets/map/us-states.svg (readable copy) and
     assets/map/us-states-inline.js (the one the game loads).

The four clean-ups, and why each one is needed:

  a) The original names each state with a lowercase CSS class
     ("me" for Maine). The game needs an id that matches the
     "abbr" in data/states.js, so each state gets id="ME"
     and data-abbr="ME".

  b) The original carries its own <style> block. Pasted into
     a web page, those rules would escape and restyle the
     whole page. It is deleted; css/style.css does the
     colors now.

  c) The original has a fixed width and height and no
     "viewBox", so it cannot be resized. A viewBox is added
     and the fixed size removed, so CSS controls how big the
     map is.

  d) The state borders are drawn as separate lines ON TOP of
     the states. Later on, when the player clicks a state,
     those lines would catch the click instead. They get
     marked "pointer-events: none" (in the CSS) so clicks
     fall through to the state underneath.

  e) The original labels every state so that resting the
     mouse on it pops up its name. That is a lovely feature
     for a reference map and a disaster for a quiz: the
     answer would appear on hover. Those labels are removed.
     The map as a whole keeps its name for screen readers.

Run it with:   python tools/build-map.py
============================================================
"""

import re
import sys
import urllib.request
from pathlib import Path

# --- Where everything lives ---------------------------------
HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent

SOURCE_URL = (
    "https://commons.wikimedia.org/wiki/Special:FilePath/"
    "Blank_US_Map_(states_only).svg"
)
SOURCE_CACHE = HERE / "us-states-source.svg"

OUT_SVG = PROJECT / "assets" / "map" / "us-states.svg"
OUT_JS = PROJECT / "assets" / "map" / "us-states-inline.js"
STATES_JS = PROJECT / "data" / "states.js"

# The map is drawn on a 959 x 593 grid. This never changes.
VIEWBOX = "0 0 959 593"

CREDIT = (
    "Source: Wikimedia Commons, \"Blank US Map (states only)\" by Heitordp.\n"
    "  License: CC0 (public domain dedication) - free to use, no credit required.\n"
    "  Rebuilt for this game by tools/build-map.py - see that file for what changed."
)


def fail(message):
    """Stop the whole script with a clear reason. Nothing gets written."""
    print("\nBUILD FAILED: " + message)
    print("No files were changed.")
    sys.exit(1)


def get_source():
    """Return the original SVG text, downloading it only the first time."""
    if SOURCE_CACHE.exists():
        print("Using the saved copy: " + SOURCE_CACHE.name)
        return SOURCE_CACHE.read_text(encoding="utf-8")

    print("Downloading the map from Wikimedia Commons...")
    request = urllib.request.Request(
        SOURCE_URL, headers={"User-Agent": "StateQuest/1.0 (build-map.py)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8")
    except Exception as error:                      # noqa: BLE001
        fail("could not download the map: " + str(error))

    if "<svg" not in text:
        fail("the download did not look like an SVG file.")

    SOURCE_CACHE.write_text(text, encoding="utf-8")
    print("Saved a copy as " + SOURCE_CACHE.name + " so re-runs work offline.")
    return text


def read_abbrs():
    """Pull the 50 two-letter codes out of data/states.js."""
    if not STATES_JS.exists():
        fail("could not find " + str(STATES_JS))
    text = STATES_JS.read_text(encoding="utf-8")
    abbrs = re.findall(r'abbr:\s*"([A-Z]{2})"', text)
    if len(abbrs) != 50:
        fail("expected 50 states in data/states.js, found " + str(len(abbrs)))
    return abbrs


def convert(source):
    """Do the four clean-ups. Returns the finished SVG text."""

    # (b) Delete the <defs> block. It holds nothing but the <style>.
    text = re.sub(r"<defs>.*?</defs>\s*", "", source, flags=re.DOTALL)

    # Drop the XML declaration. The game pastes this straight into a
    # web page, where an XML header is not allowed.
    text = re.sub(r"<\?xml[^>]*\?>\s*", "", text)

    # (c) Swap the fixed size for a viewBox so CSS can resize the map.
    #     The class and the label are added here too, so the game can
    #     style it and a screen reader can announce it.
    text = re.sub(
        r'<svg xmlns="([^"]+)"[^>]*>',
        '<svg xmlns="\\1" viewBox="' + VIEWBOX + '" class="us-map"'
        ' role="img" aria-label="Map of the United States">',
        text,
        count=1,
    )

    # (a) Rename the groups, then give every state an id.
    text = text.replace('<g class="state">', '<g class="us-map-states">', 1)
    text = text.replace(
        '<g class="borders" fill="none">',
        '<g class="us-map-borders" fill="none">',
        1,
    )

    def name_state(match):
        abbr = match.group(1).upper()
        # Washington DC is on the map but is not one of the 50 states.
        # It is drawn, but it is never a question and never clickable.
        extra = " us-map-inert" if abbr == "DC" else ""
        return (
            '<path id="' + abbr + '" data-abbr="' + abbr + '"'
            ' class="us-map-state' + extra + '"'
        )

    # Only the state shapes have a bare two-letter class. The border
    # lines are named like "al-fl", so this leaves them alone.
    text, replaced = re.subn(r'<path class="([a-z]{2})"', name_state, text)
    print("Named " + str(replaced) + " shapes (50 states + Washington DC).")

    # The little dot marking Washington DC, and the boxes drawn around
    # the Alaska and Hawaii insets.
    text = text.replace(
        '<circle class="state borders dccircle dc"',
        '<circle class="us-map-dc-dot us-map-inert"',
        1,
    )
    text = text.replace('<path class="separator1"', '<path class="us-map-separator"', 1)

    # (e) Remove the per-state hover labels, or the mouse would give the
    #     answer away. The <title> right after the opening <svg> tag names
    #     the whole map and is kept; only the ones inside shapes go.
    opening, rest = text.split("<g class=\"us-map-states\">", 1)
    rest, removed = re.subn(r"<title>[^<]*</title>", "", rest)
    text = opening + '<g class="us-map-states">' + rest
    print("Removed " + str(removed) + " hover labels that would have spoiled answers.")

    # Tidy up the blank lines those labels left behind.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip() + "\n"


def check(svg, abbrs):
    """Prove the finished map is correct BEFORE anything is written."""
    problems = []

    ids = re.findall(r'<path id="([A-Z]{2})"', svg)

    duplicates = sorted({x for x in ids if ids.count(x) > 1})
    if duplicates:
        problems.append("the same state appears twice: " + ", ".join(duplicates))

    found = set(ids)
    missing = [a for a in abbrs if a not in found]
    if missing:
        problems.append("states in states.js with no shape on the map: "
                        + ", ".join(missing))

    extra = sorted(found - set(abbrs) - {"DC"})
    if extra:
        problems.append("shapes on the map that are not in states.js: "
                        + ", ".join(extra))

    if "DC" not in found:
        problems.append("the Washington DC shape went missing.")

    if "<style" in svg or "<defs" in svg:
        problems.append("the <style> block was not removed.")

    if 'viewBox="' + VIEWBOX + '"' not in svg:
        problems.append("the viewBox was not added.")

    if re.search(r"<svg[^>]*\swidth=", svg):
        problems.append("the fixed width was not removed.")

    # Exactly one <title> should survive: the name of the whole map.
    # Any more means a state kept its hover label and would spoil answers.
    titles = svg.count("<title>")
    if titles != 1:
        problems.append("expected 1 map label, found " + str(titles)
                        + " - a state may still name itself on hover.")

    if problems:
        fail("\n  - " + "\n  - ".join(problems))

    print("Checked: all 50 states present, no duplicates, no leftover styles.")


def write_files(svg):
    """Write the readable SVG and the JavaScript copy the game loads."""
    OUT_SVG.parent.mkdir(parents=True, exist_ok=True)

    OUT_SVG.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!--\n  " + CREDIT + "\n-->\n" + svg,
        encoding="utf-8",
    )

    # A page opened straight from a folder (file://) is not allowed to
    # read its own .svg file with code, so the map is also wrapped in a
    # JavaScript file. That one always loads. Same trick as states.js.
    escaped = svg.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

    OUT_JS.write_text(
        "/* ============================================================\n"
        "   US MAP  --  the picture of the United States\n"
        "   ============================================================\n\n"
        "   Do not hand-edit this file. It is made by tools/build-map.py.\n"
        "   Edit assets/map/us-states.svg and re-run that tool instead.\n\n"
        "   Why the map is inside a JavaScript file: a page opened from a\n"
        "   folder (file://) cannot read its own .svg file with code, but\n"
        "   it can always load a .js file. Same reason data/states.js is\n"
        "   JavaScript instead of JSON.\n\n"
        "   " + CREDIT + "\n"
        "   ============================================================ */\n\n"
        "const US_MAP_SVG = `" + escaped + "`;\n",
        encoding="utf-8",
    )

    print("Wrote " + OUT_SVG.name + "  (" + str(len(OUT_SVG.read_bytes()) // 1024) + " KB)")
    print("Wrote " + OUT_JS.name + "  (" + str(len(OUT_JS.read_bytes()) // 1024) + " KB)")


def main():
    abbrs = read_abbrs()
    print("Read " + str(len(abbrs)) + " states from data/states.js.")

    svg = convert(get_source())
    check(svg, abbrs)
    write_files(svg)

    print("\nDone. The map is ready. Open map-test.html to see it.")


if __name__ == "__main__":
    main()
