# Test Suite Repair Plan — Region Regrouping Fallout

**Written:** 2026-09-21, after a manual read-only audit (no code changed yet).
**Status:** Planning only. Nothing in `tests/gate1.py`–`gate8.py` has been touched.

## Why this file exists

Fixing this properly means touching six test files and ~50 individual checks —
too much for one sitting without a lot of token spend. This document is the
memory that lets the work be split across several short sessions without
re-doing the audit each time. Start a session, paste that session's kickoff
prompt, work until the timer goes off or the phase is done, commit, stop.

## What actually happened (context)

`state-quest/data/states.js` was edited directly on the PR branch to regroup
the states from **10 regions of exactly 5 states each** into **5 regions**
matching a real school's regional lists:

| Region | States |
|---|---|
| 1. Northeast | 11 |
| 2. Southeast | 12 |
| 3. Midwest | 12 |
| 4. Southwest | 4 |
| 5. West | 11 |

**The game itself is fine.** Nothing in `js/main.js`, `js/quiz.js`, or
`js/games.js` assumes a fixed region count or size — verified by hand in a
browser. This is purely a test-suite problem: `tests/gate1.py` through
`tests/gate8.py` (all pre-existing, not written this session) hardcode the
old layout in three ways:

1. **Checkbox positions.** A few tests click `.nth(9)` or `.nth(5)` to reach
   a specific region — that assumed 10 checkboxes existed. There are 5 now.
2. **Named-region membership.** A few assertions check that ticking "New
   England" tints exactly `ME NH VT MA RI`, or that Minnesota lives in
   region index 5 ("Great Lakes"). Those regions don't exist anymore in that
   shape — their states got folded into bigger regions.
3. **Uniform-size arithmetic.** Dozens of checks read `"1 of 5"` off the
   progress counter, or expect a perfect round to score exactly `25` points,
   because every single-region round used to have exactly 5 questions. Now
   it has 4, 11, or 12 depending which region, so the text and the totals
   are both different — correctly, on the game's side.

`tests/gate9.py` (the spelling game) never touches `states.js` and is
unaffected.

## Confirmed defects, file by file

| File | Crashes today? | What's wrong | Size |
|---|---|---|---|
| gate1.py | Yes — `.nth(9)` for "Pacific" | Named-region membership (New England / Pacific), "10 distinct colors" → 5, one 5-question round loop | Medium |
| gate2.py | Yes — `start_round(page, [0, 9])` | Six `"N of 5"` checks, one `"1 of 10"` two-region check | Medium |
| gate3.py | No | Five `"N of 5"` checks | Small |
| gate4.py | No | One 5-question round loop, one `"25"` point total | Small |
| gate5.py | No | `play_round()` helper's 5-question loop, reused by several high-score checks | Small–Medium |
| gate6.py | No | Six `"N of 5"` checks, one two-region combined count | Medium |
| gate7.py | Yes — `GREAT_LAKES = 5` is out of range | Minnesota/alternate-spelling tests need the *Midwest* region now (12 states); `drive_to()` only tries 6 questions by default, so it'll miss Minnesota about half the time in a 12-state region even once the index is fixed | Medium–Large |
| gate8.py | Yes — same `GREAT_LAKES = 5` | Same Minnesota issue inside Exam Mode, several `"N of 5"` checks, one `== 10` region-heading count in the review screen | Large |
| gate9.py | No | Not affected at all | — |

Roughly **45–55 individual assertions** plus **3 real crash bugs**
(`.nth(9)`, `[0, 9]`, `GREAT_LAKES = 5`).

## The fix pattern (build it once on Day 1, then repeat it)

Don't hand-type new magic numbers — they'll break again the next time
someone edits the region list, exactly like this. Instead:

1. **Select a region by its real ID, never by screen position.**
   `page.locator('#region-list input[value="3"]')`, not `.nth(2)`.
   The checkbox's `value` is the region number from `states.js`; position on
   screen isn't a stable thing to depend on.
2. **Ask the page how many questions a round will have, don't guess.**
   ```js
   (ids) => QUIZ_DATA.items.filter(i => ids.includes(i.region)).length
   ```
   via `page.evaluate(...)`. Then build the expected string as
   `f"1 of {n}"` instead of a literal `"1 of 5"`. This makes the assertion
   self-correcting if the data changes a third time.
3. **Where a test wants "a small, clean region"** for easy arithmetic, use
   **Southwest (region id `4`, 4 states, checkbox index 3)** — the closest
   thing left to the old tidy 5-state regions. `4 × basePoints(5) = 20`.
4. **Where a test hunts for one specific state** (Minnesota, for the
   alternate-spelling checks), compute `tries` as *region size + 1* instead
   of a hardcoded 6, so `drive_to()` can't give up early in a bigger region.

## How to use this across sessions

- Each "Session" below is meant to be one Claude Code conversation. Open it
  fresh and paste that session's **kickoff prompt** — that's deliberately
  self-contained so Claude doesn't have to re-read this whole file and
  re-derive the audit above; it just needs to be told which slice to do.
- The **timer** next to each session is what to set an alarm for. It's a
  checkpoint to decide "push a little further" or "stop here," not a hard
  cutoff — if you're mid-fix when it rings, finish the file you're on before
  stopping if you can; these repairs are file-scoped, so stopping between
  files never leaves things half-broken.
- End every session by committing (Claude should do this). That's what
  makes "stop here" actually safe.
- Run the specific gate named in "Done when" before moving on — that's the
  objective check, not "it looks right."

---

## Day 1 — Foundations, gate1, gate2 (~90–120 min total)

### Session 1a — Shared helpers (~30 min timer)

> Continue the test-suite repair described in `tests/TEST_SUITE_REPAIR_PLAN.md`.
> Do **Day 1, Session 1a** only: add the three helpers described in "The fix
> pattern" section to `tests/browser.py` (region-by-value selection, a live
> question-count lookup via `page.evaluate`, and a safe `drive_to` tries
> calculation) so every later gate file can use them. Don't touch
> gate1–gate9 yet. Confirm the file still parses, commit, and stop.

**Done when:** `tests/browser.py` has the three helpers and
`python3 -c "import ast; ast.parse(open('tests/browser.py').read())"` succeeds.
**Safe to stop:** yes, this step is all-or-nothing, nothing else depends on
it being half-done.

### Session 1b — Fix gate1.py (~35 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 1, Session 1b**: fix `tests/gate1.py` using the helpers from Session
> 1a. It has one crash (`.nth(9)` no longer exists — only 5 checkboxes now)
> and several assertions written for the old "New England"/"Pacific" named
> regions, which no longer match any single region's real membership. Fix
> each one, then run `python3 tests/gate1.py` until it prints
> "GATE 1: ALL CHECKS PASSED". Commit when it does.

**Done when:** `python3 tests/gate1.py` passes cleanly on its own.

### Session 1c — Fix gate2.py (~35 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 1, Session 1c**: fix `tests/gate2.py`. It has one crash
> (`start_round(page, [0, 9])` — index 9 doesn't exist) and six `"N of 5"` /
> `"1 of 10"` progress checks tied to the old uniform region sizes. Fix each
> using the established pattern, then run `python3 tests/gate2.py` until it
> passes. Commit.

**Done when:** `python3 tests/gate2.py` passes cleanly on its own.

**End-of-day checkpoint:** `python3 tests/run-all.py 1 2` → both pass. Push.

---

## Day 2 — gate3, gate4, gate5 (~75–100 min total)

### Session 2a — Fix gate3.py (~25 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 2, Session 2a**: fix `tests/gate3.py` — five `"N of 5"` checks tied
> to the old region sizes, no crashes. Fix using the established pattern
> (see the file's own "fix pattern" section), run `python3 tests/gate3.py`
> until it passes, commit.

**Done when:** `python3 tests/gate3.py` passes.

### Session 2b — Fix gate4.py (~25 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 2, Session 2b**: fix `tests/gate4.py` — one loop that assumes a
> 5-question round (it isn't anymore for the default region) and one `"25"`
> point-total assertion that follows from it. Fix, run
> `python3 tests/gate4.py` until it passes, commit.

**Done when:** `python3 tests/gate4.py` passes.

### Session 2c — Fix gate5.py (~30 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 2, Session 2c**: fix `tests/gate5.py`. Its `play_round()` helper
> loops a hardcoded 5 times per round; several high-score tests call it
> multiple times and depend on the resulting totals. Fix the helper and
> everything downstream of it that assumed the old totals, run
> `python3 tests/gate5.py` until it passes, commit.

**Done when:** `python3 tests/gate5.py` passes.

**End-of-day checkpoint:** `python3 tests/run-all.py 1 2 3 4 5` → all five
pass. Push.

---

## Day 3 — gate6, gate7, gate8, final run (~120–150 min total — the big day)

### Session 3a — Fix gate6.py (~30 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 3, Session 3a**: fix `tests/gate6.py` — six `"N of 5"` checks and one
> two-region combined-count check, no crashes. Fix, run
> `python3 tests/gate6.py` until it passes, commit.

**Done when:** `python3 tests/gate6.py` passes.

### Session 3b — Fix gate7.py (~45 min timer — the trickiest one)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 3, Session 3b**: fix `tests/gate7.py`. `GREAT_LAKES = 5` is an
> out-of-range checkbox index — Minnesota (the state with an alternate
> capital spelling, "Saint Paul"/"St. Paul") now lives in the *Midwest*
> region (region id 3, checkbox index 2, 12 states). Point the constant at
> the real region, and increase `drive_to()`'s search budget for that
> region so it reliably reaches Minnesota in a 12-state shuffle rather than
> giving up after 6 tries. Also fix the remaining `"N of 5"` checks. Run
> `python3 tests/gate7.py` — run it two or three times in a row, since the
> Minnesota search involves a shuffle and you want to see it pass
> consistently, not just once. Commit.

**Done when:** `python3 tests/gate7.py` passes on at least 2 consecutive runs.

### Session 3c — Fix gate8.py (~45 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 3, Session 3c**: fix `tests/gate8.py`. Same `GREAT_LAKES = 5` /
> Minnesota problem as gate7 (this time inside an Exam Mode round), plus
> several `"N of 5"` checks and one `== 10` assertion about how many
> per-region headings appear on the exam review screen (should now be `== 5`
> for an all-regions exam, or better, computed from
> `Object.keys(QUIZ_DATA.regions).length`). Fix, run
> `python3 tests/gate8.py` a couple of times to confirm it isn't flaky,
> commit.

**Done when:** `python3 tests/gate8.py` passes on at least 2 consecutive runs.

### Session 3d — Full suite + wrap-up (~15–20 min timer)

> Continue the test-suite repair in `tests/TEST_SUITE_REPAIR_PLAN.md`. Do
> **Day 3, Session 3d**, the last one: run `python3 tests/run-all.py` (all
> nine gates). Confirm it prints "Everything passed." Skim
> `tests/README.md` and `Claude/SPEC.md` for any leftover mentions of "10
> regions" or "5 states per region" and update them to describe the current
> layout in general terms (don't hardcode the new counts either — regions
> may change again). Commit and push. Report a final summary: what changed,
> confirm nothing was weakened to get green, and that this plan file can be
> deleted or archived now that the work it describes is done.

**Done when:** `python3 tests/run-all.py` → "Everything passed." across all
nine gates, and the summary confirms nothing was quietly loosened.

---

## Non-negotiables for whoever runs this (call it out if tempted otherwise)

- **The game needs zero changes.** Every fix here is confined to
  `tests/gate*.py` and `tests/browser.py`. If a fix seems to require
  touching `state-quest/js/*.js`, stop and ask — that would mean the bug is
  real, not a stale test.
- **Don't loosen a check to make it pass** (e.g. turning `== 5` into
  `>= 0`, or deleting a check that no longer has an obvious equivalent).
  If a check genuinely doesn't mean anything under the new layout, say so
  explicitly in the session's summary rather than quietly dropping it.
- **A session can run past its timer.** The timer is a decision point, not
  a hard stop — if you're close to done, finish. If you're not, get to a
  clean file boundary (one gate file fully fixed or fully untouched) before
  stopping, so the next session starts clean.
