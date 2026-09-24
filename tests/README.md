# The gate checks

One file per phase gate in SPEC.md section 12. Each one opens the real game in a real Chrome
browser, plays it, and checks what happened — well over 200 checks in total.

**You never have to run these.** They exist so that the next change to the game does not
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
testing in the same browser the game is really played in is the whole point.

**On a machine with no Google Chrome** — a build server, a container, a Linux laptop — point
them at a browser binary instead:

```
STATE_QUEST_CHROME=/path/to/chrome python tests/run-all.py
```

Unset, nothing changes. A run against anything but the real Chrome is worth less, for the
reason in the caveats below; it is still worth more than no run at all.

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
| **gate9** | the Spelling List game: above all that the word is never on screen, plus what gets spoken, the free "Say it again", the next-letter hint, the capitals switch, the word list editor and its backup, and that the two games' high scores stay apart |

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

This bit us again, exactly as written. Four gates slept 900–1200ms for Phaser to boot before
ending the bonus round. On a slower machine it had not booted, so the round was ended before
there was a round to end, the results screen was never reached, and three checks that had
nothing to do with the bonus round failed. They now call `wait_for_runner(page)` and wait for
`#screen-results.is-active`. **If a check fails on a slow machine and passes on yours, look for
a `wait_for_timeout` before you look at the game.**

**Speech cannot be listened for.** Most machines have no speech voice installed at all, so
`gate9.py` checks `Speech.debugScript()` — what the game handed to the reader, in order. That
is the part the game is responsible for. Whether a voice then says it out loud is checked by a
person with ears, at GATE 9. On a machine with no voice the game prints one console warning
saying so; `tests/browser.py` lists that line, and headless GPU driver noise, as console output
that is about the machine rather than the game. Nothing else is excused.

**`?debug=1` shows the answer, so some checks must not use it.** Every gate opens the game in debug
mode, because that is what lets a check see inside the engine — but debug also prints the answer on
screen on purpose. Gate 8's whole subject is that an exam never gives the answer away, so those
particular checks open the game with no flag at all and read the page as the player would see it. A
check about what is *visible* is worth nothing if it runs in the one mode built to reveal things.
The same goes double for gate 9: the spelling game rests entirely on the word not being visible,
so that one check runs with the flag off.

**Some checks are measurements, and measurements are fiddly.** The runner ones sample a moving
game through a browser, and a few have had to be made more forgiving — taking the best of
several jumps rather than one, because a jump made underneath a ledge correctly bonks off it.
Where a check derives a number instead of measuring it directly, there is a comment saying so.

## When a check fails

Read the failure line first — they are written to say what actually went wrong, not just which
assertion tripped. Several real bugs were found this way, and roughly as many *test* bugs: if a
failure looks impossible, suspect the check before the game, and confirm by opening the game and
trying it by hand.
