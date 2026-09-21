"""Which browser the gate checks drive.

The default has always been, and still is, the real Google Chrome that is
already installed on the machine (`channel="chrome"`). That is deliberate,
and tests/README.md says why: testing in the same browser the game is
really played in is the whole point.

But there are machines with no Google Chrome on them - a build server, a
container, a Linux laptop - and on those the whole suite could not run at
all. So the choice is now one environment variable:

    STATE_QUEST_CHROME=/path/to/some/chrome   python tests/run-all.py

Set it and the suite drives that binary instead. Leave it alone and
nothing changes.

A run against anything other than the real Chrome is worth less, for the
reason README.md gives: a harness browser allows things a double-clicked
one does not. It is still worth more than no run at all.
"""

import os


def launch_args():
    """Keyword arguments for p.chromium.launch / launch_persistent_context."""
    override = os.environ.get("STATE_QUEST_CHROME", "").strip()
    if override:
        return {"executable_path": override}
    return {"channel": "chrome"}


def describe():
    override = os.environ.get("STATE_QUEST_CHROME", "").strip()
    return override if override else "the installed Google Chrome"


# ---------------------------------------------------------------------
# Console noise that is about the MACHINE, not about the game.
#
# The gates check that the console stays clean, and that check is worth
# keeping strict: a warning from the game itself is a bug report. These
# two are not from the game.
#
#   speech    - the spelling game asks the computer to read a word out
#               loud, and a computer with no voice installed says it
#               cannot. That is true, and the game already says so on
#               screen. It happens on build machines and bare Linux
#               boxes; it does not happen on a computer someone plays
#               on. Failing every gate over it would mean the suite
#               only ran on machines with a voice.
#
#   GL Driver - headless Chromium complaining about its own software
#               renderer while Phaser draws the bonus round. Real
#               Chrome on a real screen never prints it.
#
# Anything else still fails the check.
IGNORED_CONSOLE = (
    "[speech] this computer cannot read words out loud",
    "GL Driver Message",
)


def is_noise(text):
    """True if this console line is about the machine, not the game."""
    return any(bit in text for bit in IGNORED_CONSOLE)


# ---------------------------------------------------------------------
# Region helpers for the US game's gates (gate1.py-gate8.py).
#
# WHY THESE EXIST: data/states.js used to hold exactly 10 regions of
# exactly 5 states each - uniform, by design. The gates were written
# against that uniformity and it showed: tests picked a region by
# clicking the Nth checkbox, and worked out how many questions a round
# would have by simply writing the number 5 (or 10, for two regions).
#
# That broke the moment the regions were reorganized into 5 uneven
# ones to match a real school's lists. Not because anything was wrong
# with the reorganizing - states.js says right in its own header that
# it's the one file meant to be edited for exactly this reason - but
# because the TESTS had quietly started depending on a fact about the
# data that was never actually guaranteed.
#
# These three helpers are how the gates stop depending on that fact.
# Every gate file fixed from here on should use these instead of a
# raw `.nth(n)` on the region checkboxes or a hand-typed count.
# ---------------------------------------------------------------------

def region_checkbox(page, region_id):
    """The tick-box for one region, found by its REAL ID - never by
    where it happens to sit on screen.

    A region's on-screen position is just draw order; its id is the
    number in data/states.js, and `main.js` writes that id onto the
    checkbox's `value` attribute (see buildRegionSelect). Selecting by
    value keeps working no matter how many regions there are, what
    order they're listed in, or what they're named.
    """
    return page.locator(f'#region-list input[value="{region_id}"]')


def check_regions(page, region_ids):
    """Tick exactly these regions, by id. Doesn't touch any others -
    call page.click("#clear-regions-button") first for a clean slate."""
    for region_id in region_ids:
        region_checkbox(page, region_id).check()


def region_question_count(page, region_ids):
    """How many questions a round over these regions will REALLY have,
    read live from the game's own data instead of assumed.

    This is the fix for the old "just write 5" habit: a round's size
    was only ever 5 because the data happened to be uniform. Asking
    the page directly means a test's expected count updates itself the
    next time someone edits the region list, rather than going stale
    silently like the hardcoded numbers did this time.
    """
    ids = [str(r) for r in region_ids]
    return page.evaluate(
        "(ids) => QUIZ_DATA.items.filter("
        "  i => ids.includes(String(i.region))"
        ").length",
        ids)


def safe_drive_to_tries(page, region_ids, spare=1):
    """A `tries` budget for hunting through a shuffled round for one
    particular state - generous enough to reach the end of it.

    The old gates hardcoded `tries=6` for this, which was exactly
    enough for a 5-state region and not nearly enough for an 11 or
    12-state one: a search capped at 6 tries only has good odds of
    finding something buried near position 11 by chance, not a
    guarantee. This counts the region for real and adds a little
    slack, so the search can always reach the last question if it has
    to.
    """
    return region_question_count(page, region_ids) + spare
