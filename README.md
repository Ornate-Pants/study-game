# State Quest

A states-and-capitals study game for Paxton (grades 3–4).

Two halves per round. **Answer questions** about US states to earn seconds, then spend those
seconds in a **bonus runner** grabbing coins. Learning buys playing time.

## Playing it

Double-click **`state-quest/index.html`**. That is the whole installation.

No server, no build step, no internet. It runs straight from the folder, which is the
constraint that shapes most of the design decisions in the spec.

## What works today (v1.0)

| | |
|---|---|
| **Mode 1** | State Match — see a state, pick its name |
| **Mode 2** | State Speller — first letter shown, dashes for the rest |
| **Mode 3** | State Speller: Hard — no first letter, no dashes, no length hint |
| **Bonus round** | Endless runner: tap to hop, hold to jump, dodge cacti and holes, grab coins |
| **High scores** | Top ten, saved in the browser, survives closing it |

Modes 4–10 are on the mode-select screen greyed out as "Coming Soon". The build order for
those is in the spec.

## Tuning it

Every number that changes how the game feels lives in **`state-quest/data/config.js`**, with a
plain-English comment on each one. Points, jump height, how often cacti appear, how long a
stun lasts, how many backspaces a spelling question allows. Change a number, save, refresh.

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
