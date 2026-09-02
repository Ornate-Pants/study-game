# State Quest

A states-and-capitals study game for a 3rd–4th grader.

Two halves per round. **Answer questions** about US states to earn seconds, then spend those
seconds in a **bonus runner** grabbing coins. Learning buys playing time.

## Playing it

Double-click **`state-quest/index.html`**. That is the whole installation.

No server, no build step, no internet. It runs straight from the folder, which is the
constraint that shapes most of the design decisions in the spec.

## What works today (v2.1)

All ten modes are playable, in practice or as an exam.

| | |
|---|---|
| **Mode 1** | State Match — see a state, pick its name |
| **Mode 2** | State Speller — first letter shown, dashes for the rest |
| **Mode 3** | State Speller: Hard — no first letter, no dashes, no length hint |
| **Mode 4** | Capital Match — see a state, pick its capital |
| **Mode 5** | Capital Speller — first letter shown, dashes for the rest |
| **Mode 6** | Capital Speller: Hard — no help at all |
| **Mode 7** | Abbreviation Match — see a state, pick its 2 letters |
| **Mode 8** | Abbreviation Hard — type the 2 letters, both capitals |
| **Mode 9** | Find the State — read a name, click it on the map, with a zoom panel for the small north-eastern states |
| **Mode 10** | Find the Capital's State — read a capital, click the state it belongs to |
| **Bonus round** | Endless runner: tap to hop, hold to jump, dodge cacti and holes, grab coins |
| **High scores** | Top ten, saved in the browser, survives closing it |

In the capital and abbreviation games (4, 5, 6 and 8) a **Hint** button appears a few seconds
in. It tells you *which state* is lit up, and costs the same 2 points a skip does — one flat
cost, however you needed the help.

### Exam Mode

A tick box on the **Pick Your Regions** screen, and it works on any of the ten games. It is the
opposite of everything above: no hints, no second chances, and **no green, no red and no score**
until the round is over. Type or pick an answer, press Submit, find out at the end.

Backspace becomes unlimited and free, which sounds backwards until you see why it is rationed in
practice: there, the letters are checked as you type, so backspacing through the alphabet cracks a
word. With no checking there is nothing to cheat against.

At the end comes a **review screen** — the only place an exam marks anything. Every question,
grouped under its region with that region's score on the heading, showing what was answered and
what the right answer was. That per-region line is the point of the whole thing: it says where to
focus next. The bonus points are doubled, and exam scores are marked as such on the high score
table so they are never mistaken for ordinary ones.

The title screen shows which build you are running. That number lives in `data/config.js`.

## Tuning it

Every number that changes how the game feels lives in **`state-quest/data/config.js`**, with a
plain-English comment on each one. Points, jump height, how often cacti appear, how long a
stun lasts, how many backspaces a spelling question allows. Change a number, save, refresh.

`zoomSmallStates` is the one switch rather than a number: it puts a second, bigger map beside the
first in Modes 9 and 10, holding Rhode Island, Maryland, Delaware, Connecticut, Massachusetts and
New Jersey, which are too small to click comfortably on the full map. Set it to `false` to play
without it.

The questions themselves live in **`state-quest/data/states.js`** — the answer key, and the
only file that would change to teach a different subject.

## Testing helpers

Add `?debug=1` to the address for: the answer shown on screen, per-question scoring in the
console, all modes unlocked, a "Test Bonus Round" button, and a way to clear high scores.

`state-quest/map-test.html` is a standalone page that checks the map against the state data
and lights up all 50 states in turn. Useful after editing either.

## Rebuilding the assets

Neither is needed to play; both are one-time tools whose output is already committed.

```
python state-quest/tools/build-map.py      # the US map
python state-quest/tools/build-assets.py   # the runner's artwork
```

`build-assets.py` needs a Kenney art pack `.zip` in `state-quest/tools/` — those are not
committed. See `state-quest/assets/sprites/README.txt`.

## The spec

**`Claude/SPEC.md`** is the real document: the rules, the scoring, every decision and why it
was made, the phase-by-phase build plan with its test gates, and the mechanics still to come.
Read it before changing anything non-obvious.

## Credits

- Map — Wikimedia Commons, *Blank US Map (states only)* by Heitordp. CC0.
- Artwork — [Kenney](https://kenney.nl) *Jumper Pack*. CC0.
- Engine — [Phaser 3](https://phaser.io), bundled locally.

Sound is generated in the browser from notes; there are no audio files.
