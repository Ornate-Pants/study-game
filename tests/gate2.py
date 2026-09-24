"""Drive real Mode 1 rounds in Chrome and check Gate 2 (and that Gate 1 still holds)."""
import sys
from playwright.sync_api import sync_playwright
from browser import (launch_args, is_noise, check_regions,
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

problems = []


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
        problems.append(label + " " + detail)


def choices(page):
    """[(text, disabled, classes), ...] for the four answer buttons."""
    return page.evaluate("""() => [...document.querySelectorAll('.choice-button')]
        .map(b => [b.dataset.answer, b.disabled, b.className])""")


def answer(page):
    """The correct answer for the question on screen, read from the engine."""
    return page.evaluate(
        "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")


def lit(page):
    """Which state is highlighted gold right now."""
    return page.evaluate("""() => {
        const el = document.querySelector('.us-map-state.is-highlight');
        return el ? el.getAttribute('data-abbr') : null;
    }""")


def hud(page):
    return (int(page.locator("#hud-points").inner_text()),
            page.locator("#hud-progress").inner_text())


def pick(page, text):
    page.locator(f'.choice-button[data-answer="{text}"]').click()


def start_round(page, region_ids, debug=True):
    """region_ids are real region ids from data/states.js (1, 2, ...),
    not on-screen positions - see check_regions() in tests/browser.py."""
    page.goto(URL + ("?debug=1" if debug else ""))
    page.wait_for_timeout(300)
    page.click('.game-button[data-game="states"]')
    page.click("#mode-list button:first-child")
    page.wait_for_timeout(200)
    check_regions(page, region_ids)
    page.wait_for_timeout(250)
    page.click("#start-quiz-button")
    page.wait_for_timeout(300)


with sync_playwright() as p:
    browser = p.chromium.launch(**launch_args())
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console = []
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    # ============ 1. A perfect 1-region round ============
    start_round(page, [1])
    n = region_question_count(page, [1])
    cfg = page.evaluate("() => CONFIG")
    check(f"1 region gives {n} questions", hud(page)[1] == f"1 of {n}", hud(page)[1])
    check("map is on the quiz screen",
          page.locator("#quiz-map svg.us-map").count() == 1)

    # the "look here" ring, and the 2x2 button layout
    ring = page.evaluate("""() => {
        const r = document.querySelector('.us-map-ring');
        return r ? [+r.getAttribute('r'), getComputedStyle(r).display] : null;
    }""")
    check("a ring points at the state being asked about",
          ring is not None and ring[1] != "none" and ring[0] >= 26, str(ring))

    rows = page.evaluate("""() => {
        const tops = [...document.querySelectorAll('.choice-button')]
            .map(b => Math.round(b.getBoundingClientRect().top));
        return [...new Set(tops)].length;
    }""")
    check("the four answers sit in a 2 x 2 block", rows == 2,
          str(rows) + " rows")

    seen_order = []
    for q in range(n):
        a = answer(page)
        seen_order.append(a)
        opts = [c[0] for c in choices(page)]

        check(f"Q{q+1}: four choices, no duplicates",
              len(opts) == 4 and len(set(opts)) == 4, str(opts))
        check(f"Q{q+1}: the answer is among the choices", a in opts)
        check(f"Q{q+1}: the lit state matches the question",
              lit(page) == page.evaluate("() => Quiz.getState().current.abbr"),
              str(lit(page)))

        pick(page, a)
        page.wait_for_timeout(1300)   # feedbackSeconds = 1

    perfect_score = n * cfg["basePoints"]
    check(f"perfect {n}-question round scores exactly {perfect_score}",
          page.locator("#summary-points").inner_text() == str(perfect_score),
          page.locator("#summary-points").inner_text())
    check(f"summary shows {n} of {n} first try",
          page.locator("#summary-firsttry").inner_text() == f"{n} of {n}",
          page.locator("#summary-firsttry").inner_text())
    check(f"{perfect_score} points becomes {perfect_score} seconds of running",
          page.locator("#summary-seconds").inner_text() == str(perfect_score))
    check("Back button is hidden once the round is under way",
          page.locator("#back-button").is_hidden())
    check("the ring is put away when the round ends",
          page.evaluate("""() => {
              const r = document.querySelector('.us-map-ring');
              return !r || getComputedStyle(r).display === 'none';
          }"""))
    check("a tiny state still gets a big enough ring",
          page.evaluate("""() => {
              USMap.highlight('RI');
              const r = document.querySelector('.us-map-ring');
              return +r.getAttribute('r') >= 26;
          }"""))
    page.screenshot(path=str(SHOTS / "g2-summary.png"), full_page=True)

    # results math unchanged from Phase 0
    play_out_runner(page)
    quiz, coins, bonus, total = results_add_up(page)
    expected_bonus = cfg["regionBonusPerRegion"]    # exactly 1 region picked
    check(f"results math: {perfect_score} quiz + coins + "
          f"{expected_bonus} region bonus",
          quiz == perfect_score and bonus == expected_bonus
          and total == quiz + coins + bonus,
          f"{quiz} + {coins} + {bonus} = {total}")

    # ============ 2. Second chance is worth half ============
    start_round(page, [1])
    n = region_question_count(page, [1])
    a = answer(page)
    wrong = [c[0] for c in choices(page) if c[0] != a][0]

    pick(page, wrong)
    page.wait_for_timeout(400)
    after = {c[0]: c for c in choices(page)}
    check("a wrong pick does not change the score", hud(page)[0] == 0, str(hud(page)))
    check("the wrong button is disabled", after[wrong][1] is True)
    check("the wrong button is marked red", "is-wrong" in after[wrong][2])
    check("the other three stay clickable",
          sum(1 for c in choices(page) if not c[1]) == 3)
    check("the question has not moved on", hud(page)[1] == f"1 of {n}", hud(page)[1])
    page.screenshot(path=str(SHOTS / "g2-first-miss.png"), full_page=True)

    pick(page, a)
    page.wait_for_timeout(1300)
    check("right on the second pick is worth 3, not 5",
          hud(page)[0] == 3, str(hud(page)))

    # ============ 3. Wrong twice = 0, answer revealed, no repeat ============
    start_round(page, [1])
    n = region_question_count(page, [1])
    a2 = answer(page)
    missed_abbr = page.evaluate("() => Quiz.getState().current.abbr")
    wrongs = [c[0] for c in choices(page) if c[0] != a2]

    pick(page, wrongs[0])
    page.wait_for_timeout(350)

    # The reveal pause is timed from HERE, the moment the answer is
    # revealed - not from further down the file. The checks and the
    # screenshot below take a few hundred milliseconds of their own,
    # and starting the clock after them measured the pause as shorter
    # than it is, which is what used to fail this check on a good build.
    import time as _t
    revealed_at = _t.time()

    pick(page, wrongs[1])
    page.wait_for_timeout(500)

    check("wrong twice scores nothing", hud(page)[0] == 0, str(hud(page)))

    # Phase 4B: all three buttons must say what they are - the answer
    # green, and BOTH wrong picks red. The second one used to stay grey.
    marks = {c[0]: c[2] for c in choices(page)}
    check("the second wrong pick turns red too",
          "is-wrong" in marks[wrongs[1]], marks[wrongs[1]])
    check("the first wrong pick is still red",
          "is-wrong" in marks[wrongs[0]], marks[wrongs[0]])
    check("the right answer is green at the same time",
          "is-correct" in marks[a2], marks[a2])
    check("the answer is revealed on screen",
          a2 in page.locator("#quiz-feedback").inner_text(),
          page.locator("#quiz-feedback").inner_text())
    revealed = {c[0]: c for c in choices(page)}
    check("the right answer is shown in green", "is-correct" in revealed[a2][2])
    check("no more picking allowed", all(c[1] for c in choices(page)))
    page.screenshot(path=str(SHOTS / "g2-reveal.png"), full_page=True)

    # Phase 4B: the reveal pause was shortened from 3s to 2s.
    while _t.time() - revealed_at < 6:
        if hud(page)[1] == f"2 of {n}":
            break
        page.wait_for_timeout(50)
    waited = _t.time() - revealed_at
    check("it moves on by itself after the reveal",
          hud(page)[1] == f"2 of {n}", hud(page)[1])
    check("the reveal pause is the shortened ~2 seconds, not 3",
          1.4 < waited < 2.9, str(round(waited, 2)) + "s")

    # finish the round and confirm the missed state never returns. One
    # question is already resolved (missed, worth 0); the rest of the
    # region is still to come.
    remaining = n - 1
    rest = []
    for _ in range(remaining):
        rest.append(page.evaluate("() => Quiz.getState().current.abbr"))
        pick(page, answer(page))
        page.wait_for_timeout(1300)

    check("a missed question is not asked again",
          missed_abbr not in rest, missed_abbr + " in " + str(rest))
    clean_score = remaining * cfg["basePoints"]
    check(f"{remaining} right out of {n} after one blown question = "
          f"{clean_score} points",
          page.locator("#summary-points").inner_text() == str(clean_score),
          page.locator("#summary-points").inner_text())
    check(f"summary counts {remaining} of {n} on the first try",
          page.locator("#summary-firsttry").inner_text()
          == f"{remaining} of {n}",
          page.locator("#summary-firsttry").inner_text())

    # ============ 4. Two regions ============
    start_round(page, [1, 5])
    n2 = region_question_count(page, [1, 5])
    check(f"2 regions give {n2} questions", hud(page)[1] == f"1 of {n2}",
          hud(page)[1])
    for _ in range(n2):
        pick(page, answer(page))
        page.wait_for_timeout(1300)
    two_region_score = n2 * cfg["basePoints"]
    check(f"perfect {n2}-question round scores exactly {two_region_score}",
          page.locator("#summary-points").inner_text() == str(two_region_score),
          page.locator("#summary-points").inner_text())
    play_out_runner(page)
    quiz, coins, bonus, total = results_add_up(page)
    two_region_bonus = 2 * cfg["regionBonusPerRegion"]
    check(f"2-region results math: {two_region_score} quiz + coins + "
          f"{two_region_bonus} region bonus",
          quiz == two_region_score and bonus == two_region_bonus
          and total == quiz + coins + bonus,
          f"{quiz} + {coins} + {bonus} = {total}")

    # ============ 5. Keyboard, shuffling, distractor quality ============
    start_round(page, [1])
    first_of = [page.evaluate("() => Quiz.getState().current.abbr")]
    page.keyboard.press("1")
    page.wait_for_timeout(400)
    check("number keys pick an answer",
          hud(page)[0] in (0, cfg["basePoints"]) and any(
              c[1] for c in choices(page)), str(choices(page)))

    orders = []
    for _ in range(6):
        start_round(page, [1])
        orders.append(page.evaluate(
            "() => [Quiz.getState().current, ...Quiz.getState().queue]"
            ".map(s => s.abbr).join('')"))
    check("the question order is shuffled between rounds",
          len(set(orders)) > 1, str(len(set(orders))) + " distinct orders of 6")

    # distractors should come from the same region when one region is in play
    start_round(page, [1])
    names_in_region = page.evaluate(
        "() => QUIZ_DATA.items.filter(i => i.region === 1).map(i => i.name)")
    opts = [c[0] for c in choices(page)]
    check("with 1 region picked, all 4 choices come from that region",
          all(o in names_in_region for o in opts), str(opts))

    # ============ 6. Gate 1 must still pass ============
    page2 = browser.new_page(viewport={"width": 1100, "height": 1200})
    page2.on("pageerror", lambda e: problems.append("map-test pageerror: " + str(e)))
    page2.goto(GAME.joinpath("map-test.html").as_uri())
    page2.wait_for_timeout(400)
    check("Gate 1: map-test still reports no failures",
          page2.locator(".check-fail").count() == 0)

    page2.goto(URL)
    page2.wait_for_timeout(250)
    page2.click('.game-button[data-game="states"]')
    page2.click("#mode-list button:first-child")
    page2.wait_for_timeout(200)
    check_regions(page2, [1])
    page2.wait_for_timeout(350)
    tint = page2.evaluate("""() => [...document.querySelectorAll('.us-map [data-abbr]')]
        .filter(e => getComputedStyle(e).fill !== 'rgb(216, 222, 233)')
        .map(e => e.getAttribute('data-abbr')).sort()""")
    check("Gate 1: region tinting still works",
          tint == region_abbrs(page2, [1]), str(tint))

    browser.close()

bad = [c for c in console
       if c.startswith(("error", "warning")) and not is_noise(c)]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 2: ALL CHECKS PASSED" if not problems
                 else "GATE 2: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if problems:
    sys.exit(1)
