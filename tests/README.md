# The gate checks

One file per phase gate in SPEC.md section 12. Each one opens the real game in a real Chrome
browser, plays it, and checks what happened — roughly 200 checks in total.

**Scott: you never have to run these.** They exist so that the next change to the game does not
quietly break something that already worked. If a future phase gets built, run them afterwards.

## Running them

```
python tests/run-all.py          every gate, several minutes
python tests/run-all.py 3 4      just gates 3 and 4
python tests/gate4.py            one gate on its own
```

They need Playwright driving the Chrome you already have installed:

```
pip install playwright
```

No `playwright install` needed — they use your real Chrome (`channel="chrome"`), on purpose:
testing in the same browser Paxton plays in is the whole point.

## What each one covers

| | |
|---|---|
| **gate1** | the map: all 50 states present and highlightable, region tinting |
| **gate2** | Mode 1 multiple choice, the scoring maths, second chances, reveal-and-retire |
| **gate3** | Modes 2 and 3 spelling, capitalisation rule, skips, the backspace ration |
| **gate4** | the runner: jump height, hazard fairness, stuns, coins, the double-jump easter egg |
| **gate5** | high scores, name entry, sound, artwork, and surviving a browser restart |
| **gate6** | Mode 9: clicking the map, the zoom panel, and above all that the map never shows the answer |
| **gate7** | Modes 4-8 and 10: the Hint button and its one flat cost, `ME` vs `me`, Saint Paul / St. Paul |
| **gate8** | Exam Mode: that nothing marks an answer mid-round, the review screen, the doubled bonus |

Screenshots and browser profiles are written to `tests/_output/`, which git ignores. Delete it
whenever.

## Two things worth knowing before you trust a green run

**They test through a harness browser.** Playwright's Chrome may allow things a double-clicked
Chrome does not — file access in particular. That is exactly why the map and the artwork are
inlined rather than loaded as files (SPEC.md sections 9 and 10): a loose-file version passes
every check here and then fails for the actual player. **A green run is not a substitute for
opening `index.html` yourself.**

**Wait for the thing, do not sleep a guessed amount.** Answering a question starts a one-second
flash before the next one appears, and during it the map stops listening. Checks that slept a
fixed time and then clicked failed about one run in three — not because the game was wrong, but
because the click landed in that gap. `gate6.py` waits for the state itself to change (and for
gate 2's reveal timing, times from the reveal rather than from a few checks later). If a check
here is flaky, look for a sleep before blaming the game.

**`?debug=1` shows the answer, so some checks must not use it.** Every gate opens the game in debug
mode, because that is what lets a check see inside the engine — but debug also prints the answer on
screen on purpose. Gate 8's whole subject is that an exam never gives the answer away, so those
particular checks open the game with no flag at all and read the page as Paxton would see it. A
check about what is *visible* is worth nothing if it runs in the one mode built to reveal things.

**Some checks are measurements, and measurements are fiddly.** The runner ones sample a moving
game through a browser, and a few have had to be made more forgiving — taking the best of
several jumps rather than one, because a jump made underneath a ledge correctly bonks off it.
Where a check derives a number instead of measuring it directly, there is a comment saying so.

## When a check fails

Read the failure line first — they are written to say what actually went wrong, not just which
assertion tripped. Several real bugs were found this way, and roughly as many *test* bugs: if a
failure looks impossible, suspect the check before the game, and confirm by opening the game and
trying it by hand.
