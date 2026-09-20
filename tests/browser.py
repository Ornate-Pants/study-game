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
