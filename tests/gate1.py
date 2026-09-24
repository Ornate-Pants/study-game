"""Drive the real game in a browser and check Gate 1 (and Gate 0 still passes)."""
import sys
from playwright.sync_api import sync_playwright
from browser import (launch_args, is_noise, check_regions, region_checkbox,
                      region_question_count, region_abbrs)
from pathlib import Path

# Where the game is, worked out from where THIS file is, so the
# suite keeps working if the project is moved or cloned somewhere else.
GAME = Path(__file__).resolve().parent.parent / "state-quest"

# Screenshots and browser profiles go in a scratch folder that git
# ignores, rather than littering tests/.
SHOTS = Path(__file__).resolve().parent / "_output"
SHOTS.mkdir(exist_ok=True)
URL = GAME.joinpath("index.html").as_uri()

errors = []
logs = []


def wait_for_runner(page, ms=15000):
    """Wait until the bonus round is actually running.

    Phaser needs a moment to boot, and how long depends entirely on the
    machine - on a slow one it is well past any sleep worth writing. A
    fixed wait here meant the round was ended before there was a round
    to end, the results screen was never reached, and every check after
    it failed for a reason that had nothing to do with it.
    tests/README.md says it plainly: wait for the thing, do not sleep a
    guessed amount.
    """
    page.wait_for_function("() => Runner.isRunning()", timeout=ms)


def fills(page):
    """abbr -> computed fill, for every state on the map."""
    return page.evaluate("""() => {
        const out = {};
        document.querySelectorAll('.us-map [data-abbr]').forEach(el => {
            out[el.getAttribute('data-abbr')] = getComputedStyle(el).fill;
        });
        return out;
    }""")


def tinted(page):
    return sorted(a for a, f in fills(page).items()
                  if f != "rgb(216, 222, 233)")


def play_out_runner(page):
    """Start the bonus round and end it early.

    Phase 4 turned this screen into a real Phaser game, so it can no
    longer be clicked straight through: it needs a moment to boot, and
    it holds a short "Time!" pause before handing back to the results.
    """
    page.click("#start-runner-button")
    wait_for_runner(page)                  # let Phaser boot
    page.click("#finish-runner-button")    # debug button: end it now
    page.wait_for_timeout(1800)            # the "Time!" pause


def results_add_up(page):
    """(quiz, coins, bonus, total) off the results screen."""
    grab = lambda i: int(page.locator(i).inner_text())
    return (grab("#results-quiz"), grab("#results-coins"),
            grab("#results-bonus"), grab("#results-total"))


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        errors.append(label + " " + detail)


with sync_playwright() as p:
    browser = p.chromium.launch(**launch_args())
    page = browser.new_page(viewport={"width": 1280, "height": 1000})

    page.on("console", lambda m: (
        logs.append(m.type + ": " + m.text),
        errors.append("console " + m.type + ": " + m.text)
        if m.type in ("error", "warning") and not is_noise(m.text) else None))
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

    page.goto(URL + "?debug=1")
    page.wait_for_timeout(400)

    # --- walk to the region screen ---
    page.click('.game-button[data-game="states"]')
    page.click("#mode-list button:first-child")
    page.wait_for_timeout(300)

    check("map is mounted in the region preview",
          page.locator("#region-map-preview svg.us-map").count() == 1)
    check("map starts with nothing tinted", tinted(page) == [])

    # --- one region ---
    # Region ids are stable even though how many regions exist, what
    # they're named, and which states are in them are not - see
    # data/states.js's own header. Picking by id (1) and reading the
    # expected membership live means this keeps working no matter how
    # the regions get reshuffled next.
    check_regions(page, [1])
    page.wait_for_timeout(250)
    check("region 1 tints exactly its own states",
          tinted(page) == region_abbrs(page, [1]), str(tinted(page)))
    page.screenshot(path=str(SHOTS / "g1-one-region.png"), full_page=True)

    # --- two regions, two colors ---
    check_regions(page, [5])
    page.wait_for_timeout(250)
    two = tinted(page)
    check("adding a second region tints both regions' states",
          two == region_abbrs(page, [1, 5]), str(two))
    f = fills(page)
    check("the two regions use different colors", f["ME"] != f["WA"],
          f["ME"] + " vs " + f["WA"])
    page.screenshot(path=str(SHOTS / "g1-two-regions.png"), full_page=True)

    # --- unticking clears only that region ---
    region_checkbox(page, 1).uncheck()
    page.wait_for_timeout(250)
    check("unticking region 1 leaves only region 5 tinted",
          tinted(page) == region_abbrs(page, [5]), str(tinted(page)))

    # --- pick all / clear ---
    page.click("#pick-all-button")
    page.wait_for_timeout(250)
    all_t = tinted(page)
    check("Pick All tints all 50 states (DC stays gray)",
          len(all_t) == 50 and "DC" not in all_t, str(len(all_t)))
    colors = {fills(page)[a] for a in all_t}
    region_count = page.evaluate("() => Object.keys(QUIZ_DATA.regions).length")
    check(f"Pick All shows {region_count} distinct region colors "
          "(one per region)",
          len(colors) == region_count, str(len(colors)))
    page.screenshot(path=str(SHOTS / "g1-all-regions.png"), full_page=True)

    page.click("#clear-regions-button")
    page.wait_for_timeout(250)
    check("Clear returns every state to gray", tinted(page) == [])
    check("Start Round is disabled with nothing picked",
          page.locator("#start-quiz-button").is_disabled())

    # --- the quiz highlight the next phase will use ---
    page.evaluate("USMap.highlight('RI')")
    page.wait_for_timeout(400)   # let the colour fade finish before reading it
    hf = fills(page)
    check("highlight paints exactly one state",
          [a for a, v in hf.items() if v == "rgb(240, 165, 0)"] == ["RI"],
          str([a for a, v in hf.items() if v == "rgb(240, 165, 0)"]))
    page.screenshot(path=str(SHOTS / "g1-highlight.png"), full_page=True)
    page.evaluate("USMap.clearAll()")

    # --- Gate 0 must still pass: full walk through the round ---
    # (Phase 2 replaced the stub "Finish Quiz" button with a real
    # Mode 1 round, so this plays it instead of clicking through.)
    check_regions(page, [1])
    page.wait_for_timeout(150)
    page.click("#start-quiz-button")
    page.wait_for_timeout(300)
    n = region_question_count(page, [1])
    for _ in range(n):
        correct = page.evaluate(
            "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")
        page.locator(f'.choice-button[data-answer="{correct}"]').click()
        page.wait_for_timeout(1250)
    play_out_runner(page)
    check("results screen still reached",
          page.locator("#screen-results.is-active").count() == 1)
    quiz, coins, bonus, total = results_add_up(page)
    cfg = page.evaluate("() => CONFIG")
    expected_quiz = n * cfg["basePoints"]
    expected_bonus = cfg["regionBonusPerRegion"]     # exactly 1 region picked
    check(f"results math: quiz {expected_quiz} ({n} x {cfg['basePoints']}) "
          f"+ coins + region bonus {expected_bonus}",
          quiz == expected_quiz and bonus == expected_bonus
          and total == quiz + coins + bonus,
          f"{quiz} + {coins} + {bonus} = {total}")
    page.click("#play-again-button")
    check("Play Again returns to mode select",
          page.locator("#screen-mode-select.is-active").count() == 1)

    # --- back to the region screen: the map must come back with it ---
    page.click("#mode-list button:first-child")
    page.wait_for_timeout(250)
    check("map returns to the region screen on a second round",
          page.locator("#region-map-preview svg.us-map").count() == 1)
    check("a new round starts with a clear map", tinted(page) == [])

    # --- the map-test page ---
    page2 = browser.new_page(viewport={"width": 1100, "height": 1200})
    page2.on("pageerror", lambda e: errors.append("map-test pageerror: " + str(e)))
    page2.on("console", lambda m: errors.append("map-test console " + m.type
             + ": " + m.text)
             if m.type in ("error", "warning") and not is_noise(m.text) else None)
    page2.goto(GAME.joinpath("map-test.html").as_uri())
    page2.wait_for_timeout(300)
    check("map-test: no FAIL lines",
          page2.locator(".check-fail").count() == 0)
    page2.click("#cycle-button")
    page2.wait_for_timeout(400 * 52 + 800)
    shown = page2.locator("#now-showing").inner_text()
    check("map-test: cycle finished all 50", "Done - 50" in shown, shown)
    page2.screenshot(path=str(SHOTS / "g1-maptest-done.png"), full_page=True)

    browser.close()

print("\n--- console output during the run ---")
for line in logs:
    print("  " + line)

print("\n=== " + ("GATE 1: ALL CHECKS PASSED" if not errors
                 else "GATE 1: " + str(len(errors)) + " PROBLEM(S)") + " ===")
for e in errors:
    print("  " + e)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if errors:
    sys.exit(1)
