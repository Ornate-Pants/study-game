# Study Quest

Two study games for a primary schooler, sharing one engine and one bonus round.

Two halves per round. **Answer questions** to earn seconds, then spend those seconds in a
**bonus runner** grabbing coins. Learning buys playing time.

Pick your game on the way in:

| | |
|---|---|
| **United States Study** | States, capitals, abbreviations and the map. Ten modes. |
| **Spelling List** | A word is **read out loud**; spell it. Two modes, and the weekly word list is edited inside the game. |

Each game wears its own colours and keeps its own high score table, because a spelling round
and a states round were never the same thing to compare.

## Playing it

Double-click **`state-quest/index.html`**. That is the whole installation.

No server, no build step, no internet. It runs straight from the folder, which is the
constraint that shapes most of the design decisions in the spec.

## The Spelling List game (v3.0)

The word is **never shown** — that would be showing the spelling, which is the thing being
asked for. It is spoken, using the voice already installed on the computer. Nothing is
downloaded.

| | |
|---|---|
| **Spelling Practice** | First letter given, a dash for every letter still to come |
| **Spelling: Hard Mode** | No first letter, no dashes, no length hint |
| **Say it again** | Free, unlimited, and never costs a point — hearing the question again is not help with the answer. Enter does the same thing. |
| **Hint** | Fades in after a few seconds; fills in the *next* letter and costs the same flat 2 points a skip does |

### Changing next week's words

The gear button on the spelling game's mode screen, under the two mode cards. No text editor, no files.

- One word per line. Paste a whole list straight off the school handout.
- **Capital letters must match** is a tick box per list. With it off, `monday` is accepted for
  `Monday` — and the screen still fills in the capital, so the right spelling is what she ends
  up looking at.
- Which words need a capital is simply **how you type them in the list**. `Monday` asks for one;
  `because` never does. There is nothing extra to fill in.
- A word that sounds like another one gets an example sentence after a bar:
  `their | Put on their coats.` The game says the word, the sentence, then the word again.
  Without it, "their" and "there" are the same question with two right answers.
- Every word is read back underneath with a **🔊 button**, so you can hear how the computer
  will say it before she does. Some voices get a word wrong; this is where you find out.
- **Back up your lists.** They live in this browser on this computer, and "clear browsing data"
  wipes them. The editor has a copy-and-paste box holding the whole set as plain text — mail it
  to yourself once a term.

If the computer has no speech voice installed, the spelling game says so and greys itself out.
It never falls back to showing the word.

## What works in the US game

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

A tick box on the pick-what-to-practise screen, and it works on every mode of **both** games.
It is the opposite of everything above: no hints, no second chances, and **no green, no red and no score**
until the round is over. Type or pick an answer, press Submit, find out at the end.

Backspace becomes unlimited and free, which sounds backwards until you see why it is rationed in
practice: there, the letters are checked as you type, so backspacing through the alphabet cracks a
word. With no checking there is nothing to cheat against.

At the end comes a **review screen** — the only place an exam marks anything. Every question,
grouped under where it came from (a region, or a word list) with that group's score on the
heading, showing what was answered and what the right answer was. That per-group line is the
point of the whole thing: it says where to focus next. The bonus points are doubled, and exam scores are marked as such on the high score
table so they are never mistaken for ordinary ones.

The game picker shows which build you are running. That number lives in `data/config.js`.

## Tuning it

Every number that changes how the game feels lives in **`state-quest/data/config.js`**, with a
plain-English comment on each one. Points, jump height, how often cacti appear, how long a
stun lasts, how many backspaces a spelling question allows. Change a number, save, refresh.

`zoomSmallStates` is the one switch rather than a number: it puts a second, bigger map beside the
first in Modes 9 and 10, holding Rhode Island, Maryland, Delaware, Connecticut, Massachusetts and
New Jersey, which are too small to click comfortably on the full map. Set it to `false` to play
without it.

The questions live in **`state-quest/data/states.js`** (the US game's answer key) and
**`state-quest/data/spelling.js`** (the word lists the spelling game *starts* with — once
anyone uses the gear button, the lists live in the browser and that file is no longer read).

**`state-quest/js/games.js`** is the list of games, and the only place that says how they
differ: where the questions come from, what tells two apart, and whether a question appears on
a map or in a voice. A third game is an entry in that file.

## Testing helpers

Add `?debug=1` to the address for: the answer shown on screen, per-question scoring in the
console, all modes unlocked, a "Test Bonus Round" button, and a way to clear high scores.

`state-quest/map-test.html` is a standalone page that checks the map against the state data
and lights up all 50 states in turn. Useful after editing either.

In the spelling game, `?debug=1` also prints the answer on screen — so it is the one flag to
leave off when you want to see the game as she sees it.

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
