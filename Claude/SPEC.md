# State Quest: States & Capitals Study Game
## Build Specification for Claude Code
**Version:** 1.1 — built, awaiting Gate 6 | **Owner:** Scott | **Player:** Paxton (grades 3-4)

---

## 1. Concept Summary

A browser-based study game with two alternating phases per round:

1. **Quiz phase.** Player picks one or more US regions, answers geography questions (states, capitals, abbreviations depending on mode). Correct answers earn points.
2. **Bonus phase.** An endless-runner platformer. Quiz points convert 1:1 into a countdown timer (points = seconds). Player runs, jumps, and collects coins until the timer hits 0. Coins add to the score.

**Final round score = quiz points + coin points.** A persistent top-10 high score list is kept.

Educational goal: learn all 50 states and capitals, correct spelling included, by location and abbreviation. Kids learn by doing; instructions stay at a 3rd-4th grade reading level.

---

## 2. Hard Constraints (read first, these shape the architecture)

1. **Runs from a local file.** Player opens `index.html` via `file://` in a browser. No server, no build step, no internet required at play time.
   - `fetch()` of local JSON is blocked on `file://` in Chrome. **Therefore all data files are JavaScript files loaded via `<script>` tags** (e.g., `const STATES_DATA = {...}` in `data/states.js`), not fetched JSON. The structure is still JSON-shaped so Scott can hand-edit it.
   - Bundle `phaser.min.js` locally in `lib/`. No CDN references.
   - High scores persist via `localStorage` (works on `file://` in Chrome/Edge/Firefox).
2. **Hybrid rendering.** Use plain HTML/CSS/SVG (DOM) for the quiz phase, menus, and score screens. Use **Phaser 3** only for the platformer scene. Do not build the quiz UI inside Phaser; DOM is far better for text input, buttons, and an interactive SVG map.
3. **All tunable numbers live in `data/config.js`.** Nothing gameplay-related is hardcoded in logic files. See Section 8.
4. **Keyboard + mouse.** Desktop browser is the target. No mobile/touch requirement for v1.
5. **Beginner-maintainable.** Scott will hand-edit data files. Keep them flat, commented, and obvious. Code comments should explain "why" at a level a non-programmer can skim.

---

## 3. File Structure

As actually built through Phase 5B (v1.0 shipped). Files marked NEW were not in the original plan; why each exists is noted.

```
state-quest/
  index.html            (single entry point, loads everything)
  map-test.html         NEW - standalone map checker, not part of the game.
                        Section 10's verification gate, kept for reuse.
  css/
    style.css
  js/
    main.js             (app state machine: menu -> quiz -> runner -> results)
    quiz.js             (quiz engine, mode logic)
    map.js              NEW - the only file that touches the map picture:
                        highlight, region tint, the "look here" ring
    runner.js           (Phaser platformer scene)
    scores.js           (localStorage high score handling)
    audio.js            (sound loading/playing helpers)
  data/
    config.js           (ALL tunable parameters)
    states.js           (the answer key; swappable for future subjects)
  lib/
    phaser.min.js
  tools/
    build-map.py        NEW - one-time tool that fetches and cleans the map.
    us-states-source.svg    Scott never runs this; it is here so the map can
                            be rebuilt, and it checks itself against states.js.
    build-assets.py     NEW - one-time tool that pulls the runner's pictures
    kenney_*.zip              out of a Kenney art pack and inlines them.
    zip-contents.txt          Lists what was in the zip, so picking a
                              different picture later is just reading a list.
  assets/
    map/us-states.svg        (readable copy, see Section 10)
    map/us-states-inline.js  the same map as JavaScript - this is the one the
                             game loads, because file:// cannot read its own
                             .svg with code. Same trick as data/states.js.
    sprites/sprites-inline.js  the runner's pictures, inlined as data
                             URIs. Built by tools/build-assets.py from
                             a Kenney zip. Loose .png files do NOT work
                             from file:// - see Section 9.
    audio/                   EMPTY, on purpose. There are no sound
                             files; the five effects are generated in
                             js/audio.js. See Section 11.
```

Design intent: `data/states.js` is the only file that changes for a new subject (e.g., world capitals later). The quiz engine reads everything from data + config.

---

## 4. Data Schema (`data/states.js`)

```js
const QUIZ_DATA = {
  "meta": {
    "title": "US States & Capitals",
    "mapAsset": "assets/map/us-states.svg"
  },
  "regions": {
    "1":  "New England",
    "2":  "Mid-Atlantic",
    "3":  "South Atlantic",
    "4":  "Deep South",
    "5":  "Appalachia & Ohio Valley",
    "6":  "Great Lakes",
    "7":  "Great Plains",
    "8":  "Southwest",
    "9":  "Mountain West",
    "10": "Pacific"
  },
  "items": [
    {
      "name": "Maine",
      "abbr": "ME",            // also the SVG path id in the map asset
      "capital": "Augusta",
      "region": 1,
      "capitalAlternates": []   // accepted alternate spellings, e.g. St. Paul / Saint Paul
    }
    // ... all 50 states, full data in Appendix A
  ]
};
```

Rules:
- `region` is an integer 1-10 so Scott can re-map to the teacher's regions by editing one number per state.
- `abbr` doubles as the SVG element id, keeping map lookup trivial.
- `capitalAlternates` handles legitimate spelling variants (Saint Paul / St. Paul). Comparison rules in Section 6.
- Exactly 5 states per region in the initial data (see Appendix A) so rounds stay short.

---

## 5. Regions (initial assignment, baked in now, Scott will re-map later)

| # | Region | States |
|---|--------|--------|
| 1 | New England | ME, NH, VT, MA, RI |
| 2 | Mid-Atlantic | CT, NY, NJ, PA, DE |
| 3 | South Atlantic | MD, VA, NC, SC, GA |
| 4 | Deep South | FL, AL, MS, LA, AR |
| 5 | Appalachia & Ohio Valley | WV, KY, TN, OH, IN |
| 6 | Great Lakes | MI, IL, WI, MN, IA |
| 7 | Great Plains | MO, KS, NE, SD, ND |
| 8 | Southwest | TX, OK, NM, AZ, NV |
| 9 | Mountain West | CO, UT, WY, MT, ID |
| 10 | Pacific | WA, OR, CA, AK, HI |

---

## 6. Quiz Engine: Rules Common to All Modes

**Round setup.** Player selects a mode, then checks one or more regions. All states from the selected regions are shuffled into a question queue.

**Presentation.** For every question, the full US map is shown with all states outlined; the target state is highlighted (distinct fill color). Alaska and Hawaii appear as standard insets.

**Scoring.**
- First-attempt correct: flat `config.basePoints`. Region count does NOT affect per-question value; it's a bonus added once at the end of the whole round (see Section 9).
- Second-chance correct (revisit after a miss/skip, or 2nd guess in multiple choice): **`basePoints - config.penaltyPoints`**, floor 0. One flat penalty, the same however the second chance came about — see the note under Section 8.
- Second failure: the correct answer is revealed on screen for `config.revealSeconds`, the question is retired for the round, 0 points.

**Miss/skip loop (typed modes).** Skipped or failed questions go to the back of the queue exactly once. On the revisit, solving costs `penaltyPoints`; skipping/failing again = reveal + retire. No third appearance ever.

**Skip button (typed modes).** Hidden at first, fades in after `config.skipDelaySeconds` (default 5), so a word gets a real attempt before giving up is an option. Same idea as the hint button below.

**Backspace is rationed (typed modes).** `config.backspacesPerQuestion` (default 5) presses per question, shown as a row of back-arrows in the HUD that fade to dots as they are spent. Added after the first play test, where the spelling was simply brute-forced by backspacing through the alphabet until the right letter appeared.

When they run out, the question is **skipped for him** the moment he needs another one — either by pressing Backspace again, or by a wrong letter landing that he now has no way to clear. That second case is not optional: a wrong letter *blocks* further typing, so without it he would be stranded on a dead question. A forced skip is treated exactly like pressing Skip, so the queue and scoring rules gain no special case.

**Progress counter.** "Question X of Y" counts questions *finished with*, not questions shown. Otherwise a 5-question round with one skip reads "6 of 5". A returning question shows the number it had before.

**Multiple choice second chance.** Wrong first pick: the wrong option grays out, player immediately picks again from the remaining 3. Correct on 2nd pick costs `penaltyPoints`. Wrong 2nd pick = reveal + retire. (MC does not re-queue; the second guess IS the second chance.)

**Map-click second chance (added Phase 6).** The same rule as multiple choice, with the map in place of the four buttons. A wrong click turns that state red and **the red state is then dead**: clicking it again does nothing at all. That is the exact parallel of a grayed-out choice button, and it is not optional — without it an ordinary double-click would spend both chances in a single gesture, on a screen where the thing being clicked is much smaller than a button. The second click on a *different* state is the second chance; wrong there = reveal + retire.

**In click modes the map must not highlight the target.** The map is the answer sheet, so lighting the state up would hand over the answer. The question is shown as text instead, and the map stays plain until it is answered. The "look here" ring returns only on the reveal, where it points at the answer being shown.

**Typed-answer comparison rules.**
- Letter-by-letter matching against the answer string.
- **Wrong letters land, in red, and must be backspaced out** (decided during Phase 3; "wrong letters flash red; backspace to fix" was ambiguous). Only one mistake can be pending at a time: while it sits there, other letter keys shake the row and a line reads *"Press Backspace to fix it."* rather than stacking up more errors. Consequence worth stating plainly: **a typed word can never be failed by typing.** It ends either spelled correctly or skipped, which is what Mode 3's "doesn't advance until fully correct" already implies. The Skip button, or running out of backspaces, is therefore the only route into the revisit queue.
- Typos cost no *points*. A word solved on its first appearance counts as first-try in the summary however many times he backspaced along the way — the "attempt" is the appearance, not the keystroke. Backspaces are still rationed, but that is a separate limit and takes nothing off the score.
- **Capitalization matters for the first letter of each word.** If the player types the correct letter but lowercase where a capital is required, it flashes red AND a tooltip appears: *"Remember to capitalize the first letter of states or cities."* The tooltip auto-dismisses after `config.tooltipSeconds`.
- Spaces in multi-word answers (New York, Baton Rouge) are pre-filled/shown as gaps in dash modes; in no-hint modes the player types them.
- `capitalAlternates` are accepted as fully correct (engine matches against whichever alternate the typed prefix is tracking).

**Hint button (capital and abbreviation modes only, i.e., modes 4-6 and 8).** A "Hint" button fades in after `config.hintDelaySeconds` (default 8). Clicking it reveals the state's full name and deducts `config.penaltyPoints` (default 2) from that question's award, floor 0 — the same deduction a skip or a second pick costs, so there is only one penalty number in the whole game. Timer-style penalties are avoided because the quiz is untimed; points are the shared currency.

A hint and a second chance do not stack: a question that took *any* kind of second chance is worth `basePoints - penaltyPoints`, not one deduction per event. Otherwise a hinted-then-second-pick answer would land on 1 point and feel like a punishment, which Section 6 rules out.

**Feedback.** Correct: answer/state flashes green + "correct" sound. Wrong letter/pick: flashes red + soft "wrong" sound (gentle, not punishing). No lives, no failure states. Wrong answers never subtract points.

**Round end.** When the queue is empty, show a summary screen (points earned, X of Y first-try) with the round-win sound, then a "Start Bonus Round!" button.

---

## 7. The 10 Modes (full rules; build order in Section 12)

| Mode | Name | Question | Answer Method | Version |
|------|------|----------|---------------|---------|
| 1 | State Match | Highlighted state on map | Multiple choice, 4 state names (1 correct + 3 distractors drawn from the selected regions when possible, otherwise any state) | **v1.0** |
| 2 | State Speller | Highlighted state on map | Type it. First letter shown, remaining letters as dashes that fill in as typed. Wrong letters flash red; backspace to fix. Skip button available. | **v1.0** |
| 3 | State Speller: Hard | Highlighted state on map | Type it. NO first letter, NO dashes, no length hint. Doesn't advance until fully correct. Skip button available. | **v1.0** |
| 4 | Capital Match | Highlighted state on map, prompt: "What is the capital?" | Multiple choice, 4 capitals. Hint button (reveals state name, 2-pt penalty). | v2.0 |
| 5 | Capital Speller | Same prompt | Type capital, first letter + dashes. Hint button. Skip button. | v2.0 |
| 6 | Capital Speller: Hard | Same prompt | Type capital, no hints shown. Hint button. Skip button. | v2.0 |
| 7 | Abbreviation Match | Highlighted state on map | Multiple choice, 4 two-letter abbreviations. | v2.0 |
| 8 | Abbreviation Hard | Highlighted state on map | Type the 2-letter abbreviation, exact capitalization required (e.g., "ME" not "me"). Hint button reveals full state name. Skip button. | v2.0 |
| 9 | Find the State | State NAME shown as text | Click the correct state on the map. Wrong click: that state flashes red, click again (2nd click = the second chance, then reveal + retire). | **v1.1** |
| 10 | Find the Capital's State | Capital name shown as text | Click the state whose capital it is. Same click rules as Mode 9. | v2.0 |

Mode-select screen shows all 10 with v2.0 ones grayed out and labeled "Coming Soon" so the UI doesn't need rework later.

---

## 8. Config File (`data/config.js`)

Every value below with its default. Claude Code: add a one-line kid-simple comment per value.

```js
const CONFIG = {
  // --- Quiz scoring ---
  basePoints: 5,              // flat points for a first-try correct answer,
                               // same value no matter how many regions are picked
  regionBonusPerRegion: 10,    // added ONCE to the final combined score, not
                               // per question. 1 region=10, 3 regions=30,
                               // 10 regions (all states)=100
  hintDelaySeconds: 8,         // hint button appears after this
  penaltyPoints: 2,            // flat cost of needing a second chance, whether
                               // that was a hint, a skip, or a 2nd pick.
                               // 5 - 2 = 3. Floor 0. ONE number for all of it.
  skipDelaySeconds: 5,         // skip button fades in after this (typed modes)
  backspacesPerQuestion: 5,    // Backspace presses allowed per spelling question
                               // before it is skipped for him. Stops a word
                               // being cracked by backspacing the alphabet.
  examBonusMultiplier: 2,      // region bonus is multiplied by this in Exam Mode
  revealSeconds: 2,            // how long a revealed answer stays up. Was 3;
                               // shortened after the Gate 4 play test because
                               // the pause dragged. Used by BOTH the multiple
                               // choice reveal and the typed skip-twice reveal.
  tooltipSeconds: 4,           // capitalization reminder duration
  feedbackSeconds: 1,          // how long the green "correct" flash holds
                               // before the next question appears

  // --- Bonus round (runner) ---
  coinPoints: 5,
  stunSeconds: 3,
  accelSeconds: 5,             // time from standstill to full speed
  runSpeedMax: 300,            // px/sec, tune by feel
  jumpVelocity: -550,          // the FULL jump, held. tune by feel
  jumpHoldSeconds: 0.22,       // hold at least this long for the full jump
  jumpShortFactor: 0.40,       // let go early and keep only this much
                               // upward speed - a hop instead of a jump
  gravity: 1200,
  runnerMinSeconds: 15,        // shortest a bonus round can be, however bad
                               // the quiz went. TIME only - the score still
                               // uses the real quiz points.
  runnerTestSeconds: 60,       // timer for the debug "Test Bonus Round" button

  // --- What the runner builds ---
  // These four have to stay inside what a jump can do, or the game
  // generates a jump that cannot be made. With the settings above a
  // jump goes ~126px high and ~275px across at top speed.
  platformHeights: [60, 100],  // ledge heights, both under a jump
  pitWidthMin: 80,
  pitWidthMax: 150,            // keep well under the 275px full-speed reach
  hazardGapMin: 420,           // clear ground between hazards. After a stun he
                               // restarts from a standstill and needs the
                               // run-up. Much below 400 starts to feel unfair.
  pitChance: 0.35,             // how often a fair spot becomes a hole
  obstacleChance: 0.45,        // ...or a cactus. Both 0 = a calm run.
  coinArcMin: 3,
  coinArcMax: 5,               // how many coins an arc holds

  // --- High scores ---
  highScoreCount: 10,

  // --- General ---
  soundOn: true,
  debug: false                 // always false. ?debug=1 in the address turns
                               // the testing helpers on for that visit only.
};
```

Values added during the build, because Section 3 forbids hardcoding gameplay numbers and none of these behaviours had a home here: `skipDelaySeconds` and `backspacesPerQuestion` (Phase 3 / 5B), `feedbackSeconds` (Phase 2), the runner's world and timing values (Phases 4 and 5), and `jumpHoldSeconds` / `jumpShortFactor` / `pitChance` / `obstacleChance` (Phase 5B).

**`examBonusMultiplier` is specified but not yet in `data/config.js`** — it arrives with Exam Mode in Phase 8 (Section 14). Everything else in this block is live.

**One penalty, one number (Scott's decision, replaces the old split rules).** There used to be two competing ideas — a hint penalty in points and a separate "half credit" formula for second chances — and they disagreed with each other and with the built config. They are now the same thing: **needing a second chance costs a flat `penaltyPoints` (2), however it happened.** Hint, skip-and-return, or right-on-the-second-pick all land a solved question on `5 - 2 = 3`.

Why flat and not "half credit": at `basePoints: 5` the two happen to agree (both give 3), but they drift the moment Scott tunes `basePoints`. At 10 points a question, half credit is 5 while the flat penalty is 8. A flat cost keeps the rule sayable out loud — *"a second chance costs 2 points"* — which is the kind of thing a 9-year-old can actually hold on to. It also means the penalty never scales into something punishing.

If the hint ever needs to cost more than a skip, split this back into two values; nothing in the engine depends on there being only one.

Note on scoring: per-question value is always flat `basePoints` (default 5), regardless of how many regions are in play. Adding more regions only adds more *questions* (5 states per region), which naturally lengthens the runner countdown, that growth alone is enough and is why the old per-question multiplier was removed. Region count's only other effect is the one-time `regionBonusPerRegion` (10 pts/region) added to the final combined score in Section 9, not to the quiz or runner phases individually. **Balance target: quiz phase and bonus phase should feel like comparable lengths of play.** A 5-state single-region perfect round = 25 points = 25 seconds of runner. That's the tuning anchor.

---

## 9. Bonus Round: Endless Runner Spec (Phaser 3)

- Side-scrolling auto-runner. Player accelerates from a standstill to `runSpeedMax` over `accelSeconds`, then holds speed. One button (Space / Up / click) to jump. Simple gravity. No double-jump, no complex physics.

> **Variable jump height (added Phase 5B, after the play test).** One fixed jump height did not feel right. The button now gives a **hop when tapped and a full jump when held**: full upward speed on press, and if it is released within `jumpHoldSeconds` while still rising, the remaining upward speed is cut to `jumpShortFactor`. The *full* jump is unchanged at a ~126px apex and ~275px reach, which is what the level generator is sized against — a tapped jump will not clear a pit, and that is now player skill rather than an unfair level.
- **Timer:** starts at the quiz point total, counts down in big friendly numerals. At 0: freeze, lock score, play round-win sound, go to results.
- **World:** procedurally repeated ground segments with three element types, randomly placed with fair spacing (no impossible sequences; guarantee min gap = jump distance):
  1. **Coins** (single, and occasional arcs of 3-5). Each = `coinPoints`. Coin sound on collect.
  2. **Obstacles** (crate/rock at ground level). Collision = stunned 3 seconds (flashing sprite, no control), then the player is placed just past the obstacle and resumes from zero speed (re-accelerates). The countdown keeps running during stuns; that IS the penalty.
  3. **Pits** (gaps in the ground). Falling in = same stun rules, resume on the far side.

**Both hazards behave identically: the player is moved clear of the hazard the instant he is hit, and flashes *there* while the clock runs down.** Not flashing at the point of impact and then jumping across at the end — that reads as two separate events. For a pit it is also the only way to see anything at all, since freezing him where he fell means freezing him below the bottom of the screen (both found in the Gate 4 play test).

Move him with the physics body's own reposition, not by setting the drawn shape's coordinates. The body keeps its own copy of the position, so moving only the sprite leaves the two disagreeing — the visible symptom is the player hovering a few pixels below the ground and then snapping up when he starts running.

**Where the player is put down after a stun — get this right or it stuns twice.** The resume point must be measured from **the hazard**, never from the player. Measuring from the player looks correct, because landing on top of a crate leaves him well clear; but running into the crate's *left face* stops him further back, and the same sum then drops him exactly touching the right edge, which re-triggers the overlap instantly. Use the crate's own right edge plus the player's width. There is also a short grace window after any stun during which hazards are ignored, as a backstop.
- **Elevated platforms:** 1-2 heights above ground level, reachable with a single jump, holding bonus coin arcs. Keeps "jump onto different levels" without real level design.

> **They must be ONE-WAY (added Phase 5B).** Built as ordinary solid boxes they collide on all four sides, so jumping from underneath cracks your head on the platform you are trying to reach — you can never get up to it. Collision is switched off on the underside and both edges, leaving only the top: you pass up through and land on it, and once your feet are on top you still cannot fall back through.
>
> **The runner must also be drawn IN FRONT of them.** The platform artwork hangs well below the thin strip you actually stand on, and behind it the runner disappears from view as he passes.
- Hardcoded-feel constants (jump height, platform heights) are fine but store them in `config.js` per Section 8.
- Placeholder-first: colored rectangles until the loop feels right, then swap in Kenney sprites.

> **DONE in Phase 5.** Art is Kenney's **Jumper Pack** (CC0) — §9's original suggestion, *"Platformer Pack Redux"*, no longer exists (404). Player (stand/jump/hurt poses), coins, a cactus for the obstacle, grass ledges, grass tufts.
>
> **Two things this section did not anticipate:**
>
> 1. **Loose `.png` files cannot work from `file://`.** Chrome treats a `file://` page as an opaque origin, so uploading such an image into a WebGL texture taints the canvas and throws. Sprites are therefore **inlined as base64 data URIs** in `assets/sprites/sprites-inline.js`, the same trick as the map. Worse, the loose-file version *appears* to work under a test harness, whose browser may carry file-access flags that a double-clicked Chrome does not — so this fails only for the actual player.
> 2. **The ground stays a plain coloured band.** Jumper Pack is a *vertical* jumper: its ground pieces are rounded floating platforms, which show seams laid end to end. The raised ledges — which genuinely are floating platforms — do use the sprite.
>
> **The rule that keeps the physics safe:** every moving part is still the same invisible box it was in Phase 4, at the same size, with the same body. The picture is drawn on top and follows it. Art may change how something looks and nothing about how it behaves — the tests assert that jump height, jump distance and hazard spacing are identical with the art on or off.

**Results screen:** total = quiz points + coin points + `(regionCount * config.regionBonusPerRegion)`. The region bonus is added exactly once here, after both phases are done, never during scoring in either phase. If total makes the top 10: name entry (3-12 chars, prefilled with last-used name from localStorage), special victory fanfare, confetti-style flash. High score table displays rank, name, score, mode, regions, date.

---

## 10. Map Asset Plan (the highest-risk asset, solve it Phase 1)

> **RESOLVED in Phase 1.** Option 1 below worked. The map is Wikimedia Commons *"Blank US Map (states only)"* by Heitordp, **CC0 / public domain — no attribution needed**, so nothing has to go on an About screen. All 50 ids verified against `abbr`; AK and HI were already inset. Four clean-ups were applied by `tools/build-map.py` (a one-time, re-runnable tool): ids added from the original lowercase classes, the embedded `<style>` stripped so it cannot leak into the page, a `viewBox` added so the map scales, and the border lines made click-through so they cannot swallow clicks in Modes 9-10.
>
> A fifth clean-up was **not** anticipated here and matters: the original names every state in a `<title>` tag, so hovering a state popped up its name. Lovely on a reference map, fatal in a quiz — it hands over the answer. Those are stripped, and the build tool refuses to write the file if even one survives.
>
> A sixth thing was added in Phase 2, also not anticipated: colouring a small state gold is **not enough to show which state is being asked about.** Highlighted Rhode Island is a speck. `js/map.js` now draws a dashed "look here" ring around the target, floored at a minimum size so tiny states are obvious and capped so Texas does not get a ring around half the country.

**Requirement:** one SVG of the US where every state is a distinct `<path>` with `id` equal to its 2-letter abbreviation, AK/HI as insets.

**Approach, in order of preference:**
1. Download the public-domain **Wikimedia Commons "Blank US Map (states only)"** SVG, which already has per-state paths keyed by 2-letter ids. Save as `assets/map/us-states.svg`. Verify every id matches the `abbr` field; fix any mismatches in the SVG once.
2. Fallback: simplemaps free US SVG (free license with attribution; put attribution in the game's About/credits screen).

**Integration:** inline the SVG into the quiz DOM (load its text and inject, or paste it into a JS template string in `assets/map/us-states-inline.js` to dodge `file://` fetch limits; the template-string approach is safest and is the default). Highlight = swap a CSS class on the path. Click detection for modes 9-10 = native SVG click events on paths. Do NOT rasterize states as separate images; one SVG with ids covers highlighting AND clicking for all modes.

**Verification gate:** a throwaway test page that cycles a highlight through all 50 ids. All 50 must light up before quiz work proceeds.

---

## 11. UI / UX Requirements

- Reading level: 3rd-4th grade. Short sentences. Example round-start text: "Pick your regions. Answer questions to earn time. Then run and grab coins!"
- Big buttons, big readable font (min 18px body), high contrast, friendly rounded style.
- Screens: **Title -> Mode Select -> Region Select -> Quiz -> Round Summary -> Bonus Runner -> Results/High Scores -> (Play Again loops to Mode Select).**
- A small persistent HUD during quiz: current points, question X of Y.
- Sounds: correct answer, wrong (soft), coin, round-end success, new-high-score fanfare. Mute toggle in a corner, state saved to localStorage.

> **DONE in Phase 5, but not with files.** There are **no audio files**. The five effects are generated from notes by the browser in `js/audio.js`. Files would have meant five more things to source, place and keep working from `file://`; notes always work, weigh nothing, and are tuned by editing numbers. Each sound is a short readable recipe at the top of that file. The mute button and `CONFIG.soundOn` are unchanged.
- No timers or pressure cues during the quiz phase itself. The quiz is untimed by design; the pressure lives in the runner.

---

## 12. Build Plan: Phases and Test Gates

Claude Code should execute phase by phase and STOP at each gate for Scott to test in a browser before continuing. Each gate lists exactly what Scott checks.

**Progress: Phases 0-5 and 5B are BUILT and have PASSED their gates; v1.0 is shipped. Phase 6 (Mode 9) is BUILT and its check suite passes, awaiting Scott's Gate 6 play test — that is v1.1. Remaining: Phase 7 (Modes 4-8 and 10, v2.0), Phase 8 (Exam Mode, v2.1 - see Section 14).**

### Phase 0: Scaffold (v1.0) — DONE, gate passed
Project structure, `index.html` loading everything via script tags from `file://`, Phaser bundled locally, empty screen state machine (Title -> stub screens), config + full states data file (Appendix A).
**GATE 0:** Scott double-clicks `index.html`; title screen appears; can click through stub screens; no console errors on `file://`.

### Phase 1: Map + Data (v1.0) — DONE, gate passed
Acquire and integrate the SVG per Section 10. Build the highlight test page. Region select screen with live map preview (selected regions' states tinted).
**GATE 1:** All 50 states highlight correctly; region checkboxes tint the right 5 states each.

### Phase 2: Quiz Engine, Mode 1 (v1.0) — DONE, gate passed
Question queue, shuffling, MC rendering, 2nd-chance logic, scoring per Section 8 (flat `basePoints` per question; the region bonus is added once at the results screen and never during the quiz), the flat second-chance penalty, reveal/retire, green/red feedback, round summary screen.
**GATE 2:** Scott plays full Mode 1 rounds: 1 region and 2 regions. Verify point math on screen matches Section 8 by hand. Verify a deliberately-missed question behaves per Section 6.

### Phase 3: Modes 2 and 3 (v1.0) — DONE, gate passed
Typed input engine: dash display, letter-by-letter validation, red flash + backspace, capitalization tooltip, skip button, revisit queue, hard mode (no scaffolding). Shared code with Mode 5/6/8 in mind (answer string is a parameter, not hardcoded to `name`).
**GATE 3:** Scott spells correctly, misspells, tests lowercase first letter (tooltip fires), skips twice (reveal + retire), multi-word state (New Hampshire in region 1).

### Phase 4: Runner (v1.0) — DONE, gate passed
Phaser scene with placeholder rectangles: accel, jump, coins, obstacles, pits, stun, countdown from a hardcoded 60 for testing, score lock at 0.
**GATE 4:** Scott plays with a fixed 60s timer. Checks: fair obstacle spacing, stun feels ok (not rage-inducing), jump reaches platforms, coins register.

### Phase 5: Integration + Scores + Polish (v1.0) — DONE, gate passed
Wire quiz points into runner timer. Results math. localStorage high scores + name entry + fanfare. Swap placeholders for Kenney sprites. Add all sounds + mute. Instruction text pass at grade level.
**GATE 5 (v1.0 SHIP):** Two full end-to-end rounds, one setting a high score, then close the browser fully, reopen, confirm high scores persisted. Kid test: Paxton plays; Scott notes friction.

### Phase 5B: Play-test fixes (v1.0) — DONE, gate passed
Not in the original plan; it came out of watching Paxton play. Variable jump height (tap for a
hop, hold for a full jump, per Section 9). One-way platforms, and the runner drawn in front of
them, so a ledge can be reached from below and he is never hidden behind one. Hazard frequency
moved into `config.js` (`pitChance`, `obstacleChance`) and `hazardGapMin` fixed to mean what it
says — it was silently doubling. Backspace rationed per Section 6, with the count shown in the HUD.
**GATE 5B:** tap and hold give clearly different jumps; a ledge can be jumped onto from directly
underneath; hazards come often enough; the backspace arrows count down and the question is
skipped when they run out.

### Phase 6: Mode 9 (v1.1) — BUILT, awaiting gate
Click-the-map mode: name shown as text prompt, SVG click handling, 2-click second-chance rule, hover affordance (cursor + subtle outline).
**GATE 6:** Misclicks behave per spec; tiny states (RI, DE) are clickable without frustration (if not, add a zoom-on-region option to config as a stretch).

> **How it was built.** One delegated click listener on the whole map rather than fifty
> (`USMap.setClickable`), switched off the moment a round ends — there is only ONE map and it is
> *moved* between screens, so a listener left on would follow it onto Pick Your Regions. The quiz
> engine gained a third `answerWith` (`"mapClick"`) beside `"choices"` and `"typing"`; the scoring,
> the second-chance rule and reveal-and-retire are the same code all three modes already shared.
> Mode 10 in Phase 7 is the same line with `asks: "capital"` — the click compares the state's
> `abbr`, which is the target either way.
>
> **On the small states — the zoom panel, added after the Gate 6 play test.** The first attempt was
> just to give the map more room, since click modes have no answer buttons under it
> (`body.is-map-click`). That took Rhode Island from a speck to about 12 x 17 real pixels, and the
> play test's verdict on that was *findable, but too fiddly to click*. So the stretch named above
> was built.
>
> **It is a second, smaller map, not a magnifying transform.** A panel beside the main map holds
> copies of the same shapes seen through a `viewBox` covering only the north-east corner, so the
> browser does the enlarging and there is no zoom arithmetic anywhere in the code. Rhode Island is
> **32 pixels** wide in the panel against 11 on the map; Delaware 42; Connecticut 68.
>
> Three things make it cost almost nothing:
> - **A copy is an ordinary state shape with an ordinary `data-abbr`.** The click handler cannot
>   tell a copy from the original and does not need to, so clicking in the panel needed no new code
>   at all. `USMap.setLook` writes to a state and its copies together, which is what keeps the red
>   and the green identical in both views.
> - **The copies lose their `id`.** An id may be used once per page — this is the same trouble the
>   one-map rule at the top of `js/map.js` exists to avoid.
> - **Nothing is drawn twice while it is not needed.** The panel is taken off the page between
>   rounds, so anything counting the states on the page finds exactly fifty.
>
> The six it shows are the ones the play test named: RI, MD, DE, CT, MA, NJ. Their neighbours are
> drawn a shade paler behind them, so the six read as the subject rather than the panel being one
> flat sheet of grey — still clickable, just quieter. `CONFIG.zoomSmallStates` turns the whole
> thing off.
>
> Two things that had to be got right and were not obvious: the Washington DC marker is a dot sized
> for the full map, and blown up this far it reads as a hole punched in Maryland, so it is not
> copied. And the white lines between the states must be copied or the panel is one grey blob —
> each line is named for the two states it runs between (`ct-ma`), which is how the panel takes
> only the ones it needs.

### Phase 7: Modes 4-8 and 10 (v2.0)
Reuse engines: capital variants (4-6) = typed/MC engine pointed at `capital` + hint button; 7-8 = abbreviation variants with exact-capitalization rule; 10 = click engine pointed at capitals. Un-gray the mode select buttons.
**GATE 7:** One round of each new mode; verify the hint costs the same 2 points a skip does, and that a hinted answer solved on the second pick is still 3 and not 1; verify "me" vs "ME" in Mode 8 triggers red + tooltip; verify capitalAlternates (Saint Paul / St. Paul) in Mode 5/6.

### Phase 8: Exam Mode (v2.1)
The switch described in Section 14, for all built modes: no hints, no second chances, and no feedback of any kind during the round. Backspace stays available and free, because with the letter-by-letter checking off there is nothing left to cheat against. Submit-based answering, the end-of-round review screen with per-question marks and a per-region tally, doubled region bonus, and an exam marker on high score rows.
**GATE 8:** Scott plays an exam round and confirms nothing gives the answer away mid-round; the review screen matches what was actually answered; the per-region tally adds up; the doubled bonus lands once on the results screen; an exam high score is marked as one.

---

## 13. Testing Notes for Claude Code

- Add a `?debug=1` URL flag: shows the answer on screen, sets runner test timer, unlocks all modes. Never on by default.
- Console-log the scoring math per question in debug mode so gate checks are easy.
- Manual browser testing on `file://` in Chrome is the acceptance environment. Do not rely on dev-server-only behavior.
- Keep functions small and commented; Scott may read this code with future Claude sessions.

---

## 14. Exam Mode (v2.1 — built in Phase 8)

Added after the first real play test. Everything else in this spec is **practice**: hints,
second chances, immediate green and red. Exam Mode is the opposite — it is how Scott finds out
what Paxton actually knows, and how Paxton proves it.

**It is a switch, not a mode.** It can be turned on for any of the ten modes in Section 7. The
toggle lives on the Region Select screen, below the region checkboxes, so the choice is made
right before a round starts.

### What changes while it is on

| | Practice (today) | Exam Mode |
|---|---|---|
| Hints | available in modes 4-6, 8 | **none** |
| Backspace | rationed to `backspacesPerQuestion` (5) | **unlimited and free** — see below |
| Second chances | second pick / revisit queue | **none** — one answer per question |
| Skip | goes to the back of the queue once | allowed, but **gone for good**: marked "Skipped", 0 points |
| Feedback during the round | green, red, reveal | **nothing** |
| Answering | letter-by-letter / instant | type or pick, then **Submit** |
| Region bonus | `regionBonusPerRegion` | **doubled**, via `examBonusMultiplier` |

Note the backspace row, which is the opposite of what you might expect. Backspace is rationed
in practice because the letter-by-letter checking turns it into a cheat — you can backspace
through the alphabet until a letter is accepted. In Exam Mode there is no checking to cheat
against, so Backspace is just ordinary typing correction and carries no cost or limit.

**No feedback means no feedback.** This is the point of the whole mechanic, and it is the part
easiest to get wrong. The letter-by-letter checking built in Phase 3 *is* feedback — a wrong
letter turning red tells him he is wrong. So in Exam Mode the typed modes become a plain text
box he types his best answer into, with the checking turned off, and a Submit button. Backspace is permitted to correct typos, etc prior to submit. No penalty for backspace. The map
does not flash. Nothing is revealed. He finds out at the end.

Skip is permitted, but there is no second chance. The question is marked "skipped" in the review screen and awarded no points.

### The review screen

Shown when the last question is submitted, before the bonus round. It is the only place any
answer is marked.

- **Every question, in order**, marked ✓, ✗ or "Skipped", showing what he answered and — where
  he was wrong — the right answer. A skipped question shows the right answer with a blank where
  his would have been.
- **A per-region tally**, which is what tells Scott where to focus:
  *"Great Lakes 5/5 · New England 3/5 · Pacific 4/5"*.
- Then **"Start Bonus Round!"** as usual. Quiz points still become running seconds, so the
  exam still earns playing time.

### Scoring

Each question is worth `basePoints` or nothing — there is no second chance to take
`penaltyPoints` off. The doubled region bonus is applied once, on the results screen, where the
region bonus already lands:

```
total = quizPoints + coinPoints
      + (regionCount * regionBonusPerRegion * examBonusMultiplier)
```

**High score rows must record that it was an exam**, so a doubled-bonus score is never silently
ranked against a practice one. The high score table gains a mark on exam rows.

### Notes for whoever builds this

- `Quiz` already keeps a per-question record of what happened; the review screen needs that
  extended to remember **what the player actually answered**, which is not stored today.
- The `MODE_RULES` table is the right place for this to hook in — Exam Mode changes
  `answerWith` behaviour rather than adding new modes.
- Do not let the map highlight double as feedback: it must keep showing the *question*.

---

## Appendix A: Full State Data (authoritative, do not invent values)

| State | Abbr | Capital | Region | Capital Alternates |
|-------|------|---------|--------|--------------------|
| Maine | ME | Augusta | 1 | |
| New Hampshire | NH | Concord | 1 | |
| Vermont | VT | Montpelier | 1 | |
| Massachusetts | MA | Boston | 1 | |
| Rhode Island | RI | Providence | 1 | |
| Connecticut | CT | Hartford | 2 | |
| New York | NY | Albany | 2 | |
| New Jersey | NJ | Trenton | 2 | |
| Pennsylvania | PA | Harrisburg | 2 | |
| Delaware | DE | Dover | 2 | |
| Maryland | MD | Annapolis | 3 | |
| Virginia | VA | Richmond | 3 | |
| North Carolina | NC | Raleigh | 3 | |
| South Carolina | SC | Columbia | 3 | |
| Georgia | GA | Atlanta | 3 | |
| Florida | FL | Tallahassee | 4 | |
| Alabama | AL | Montgomery | 4 | |
| Mississippi | MS | Jackson | 4 | |
| Louisiana | LA | Baton Rouge | 4 | |
| Arkansas | AR | Little Rock | 4 | |
| West Virginia | WV | Charleston | 5 | |
| Kentucky | KY | Frankfort | 5 | |
| Tennessee | TN | Nashville | 5 | |
| Ohio | OH | Columbus | 5 | |
| Indiana | IN | Indianapolis | 5 | |
| Michigan | MI | Lansing | 6 | |
| Illinois | IL | Springfield | 6 | |
| Wisconsin | WI | Madison | 6 | |
| Minnesota | MN | Saint Paul | 6 | St. Paul |
| Iowa | IA | Des Moines | 6 | |
| Missouri | MO | Jefferson City | 7 | |
| Kansas | KS | Topeka | 7 | |
| Nebraska | NE | Lincoln | 7 | |
| South Dakota | SD | Pierre | 7 | |
| North Dakota | ND | Bismarck | 7 | |
| Texas | TX | Austin | 8 | |
| Oklahoma | OK | Oklahoma City | 8 | |
| New Mexico | NM | Santa Fe | 8 | |
| Arizona | AZ | Phoenix | 8 | |
| Nevada | NV | Carson City | 8 | |
| Colorado | CO | Denver | 9 | |
| Utah | UT | Salt Lake City | 9 | |
| Wyoming | WY | Cheyenne | 9 | |
| Montana | MT | Helena | 9 | |
| Idaho | ID | Boise | 9 | |
| Washington | WA | Olympia | 10 | |
| Oregon | OR | Salem | 10 | |
| California | CA | Sacramento | 10 | |
| Alaska | AK | Juneau | 10 | |
| Hawaii | HI | Honolulu | 10 | |

---

## Appendix B: Judgment Calls Made Without Explicit Direction (flag to Scott if wrong)

1. ~~**MC half credit:** correct on 2nd guess in multiple choice = half credit.~~ **SETTLED by Scott:** replaced by the one flat `penaltyPoints` rule. See Section 8.
2. **Hint penalty is points, not time,** since the quiz is untimed. **SETTLED by Scott:** it is the same 2 points a skip or a second pick costs, not a separate number. See Section 8.
3. **Stun keeps the countdown running** rather than adding a separate time penalty; losing 3+ seconds of collecting IS the cost.
4. **Region bonus:** flat `10 * regionCount`, added once at the end of the round (not per-question, not compounded). Per-question value is always flat `basePoints`; more regions only lengthens the round by adding more questions. The hint/skip penalty values were flagged here as un-retuned; **Scott has since settled them** — one flat `penaltyPoints: 2` for every kind of second chance. See Section 8.
5. **Distractor choices** in MC modes prefer same-region states so the quiz teaches discrimination between neighbors.
6. **Region groupings** in Section 5 are Scott-approved placeholders; teacher regions will be re-mapped by editing `region` integers only.

### Decided during the build (Phases 1-3), all Scott-approved unless noted

7. **Washington DC is drawn but inert.** It is on the map, because a US map without it looks wrong, but it is never a question, never tinted, and clicks pass straight through it. It is not in `states.js` and does not need to be.
8. **Region colours:** each of the 10 regions gets its own colour rather than one shared highlight, so neighbouring picked regions never merge into one blob. The dot on each region checkbox is the map's key. All ten live as CSS variables in `style.css`.
9. **The "look here" ring** around the state being asked about — see the note in Section 10. Without it, small states are unreadable as a question.
10. **Per-state hover labels stripped from the map** — they gave the answer away on mouseover. See Section 10.
11. **Auto-advance between questions**, after a green flash lasting `feedbackSeconds`, rather than a "Next" button. Keeps a 5-question round moving without extra clicking.
12. **Back button is hidden from the quiz screen onward.** A round is a commitment; an accidental Back mid-question should not be able to throw away the points earned so far.
13. **Wrong typed letters land in red and must be backspaced out**, and the **Skip button fades in** rather than being present from the first keystroke. Both are written up in Section 6.
14. **The progress counter counts questions finished, not shown** — see Section 6.
15. **One map instance, moved between screens** rather than one copy per screen, so no two elements ever share an `id`. Only one screen is visible at a time, so one map is enough.
16. **The coin double-jump is an EASTER EGG, not a bug. Do not remove it.** Landing on a coin lets the player jump again, so holding the jump button bounces him along a line of coins. It happens because Arcade physics sets the `touching` flags during *overlap* checks as well as solid ones, so a coin underfoot reads as ground. It was unintended; Scott played it, liked it, and asked to keep it. Section 9's "no double-jump" still holds everywhere else. The line in `jump()` is commented, and a test guards it.
17. **No sound files (Phase 5).** The five effects are generated from notes in `js/audio.js` rather than shipped as `.ogg` files. See the note under Section 11 for why. Editing a sound means editing numbers, not opening an audio editor.
18. **Art is separated from physics (Phase 5).** Every moving part in the runner is still the invisible box it was in Phase 4; sprites are drawn on top and follow along. This is deliberate and load-bearing — it is what lets artwork be swapped without re-testing the jump and hazard maths. Do not "simplify" it by giving the sprites their own physics bodies.
19. **Known limit for Phase 7:** `capitalAlternates` matching is built and working, but alternates of *different lengths* will break the dash display in Mode 5 — "Saint Paul" is 10 characters and "St. Paul" is 8. The dashes will need to key off whichever candidate still matches what has been typed. No state name has an alternate, so Modes 2 and 3 are unaffected.

### Decided during Phase 6

20. **A state clicked and refused is dead for that question** — it stays red and further clicks on
    it do nothing. Written up under Section 6. Without it a double-click spends both chances at
    once, which is much easier to do on a small shape than on a button.
21. **The map gets more room in the click modes** (38vh → 52vh, and a wider page), because those
    modes have no answer buttons beneath it. Free, but not enough on its own — see the next item.
    Not more than 52vh: the state's name sits in a big box *above* the map in these modes, and at
    62vh the "Not that one, try again" line fell below the bottom of the window on an ordinary
    1366 x 768 laptop. The map looked splendid and the reply was invisible.
21b. **The zoom panel, after the Gate 6 play test said the small states were too fiddly.** Scott
    named the six: RI, MD, DE, CT, MA, NJ. Built as a second small map beside the first rather than
    as a magnifier drawn on the map itself, because there is nowhere on the map with room — the
    only empty space big enough is in the Atlantic, and a panel there covers Florida. Written up
    under Phase 6 in Section 12. The trade is that the main map is narrower during a click round;
    that costs the big states nothing, since none of them were ever hard to hit.
22. **There is a version number in the game now** — `CONFIG.APP_VERSION`, shown small at the foot of
    the title screen. It is written down in exactly one place, `data/config.js`, the same rule as
    every other number in the game.
23. **The gate suites now exit non-zero when a check fails.** They did not, so `run-all.py` reported
    "passed" for any gate that ran to the end, however many FAIL lines it printed. Found by running
    the full set for this phase; gate 2's reveal-pause check had been failing on a good build
    because it started its stopwatch after a screenshot. The check was measuring itself, not the
    game — the kind of test bug `tests/README.md` warns about.
