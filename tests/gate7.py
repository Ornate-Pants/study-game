"""Drive the capital and abbreviation modes in Chrome and check Gate 7.

Modes 4, 5, 6, 7, 8 and 10 - the whole of v2.0. What this gate is
really for, in the spec's words:

  * the Hint button costs the same 2 points a skip does
  * a hinted answer solved on the SECOND pick is still 3, not 1
  * "me" vs "ME" in Mode 8 is refused, with the reason said out loud
  * "Saint Paul" and "St. Paul" both count in Modes 5 and 6
"""
import sys
from playwright.sync_api import sync_playwright
from browser import launch_args, is_noise
from pathlib import Path

# Where the game is, worked out from where THIS file is, so the
# suite keeps working if the project is moved or cloned somewhere else.
GAME = Path(__file__).resolve().parent.parent / "state-quest"

# Screenshots and browser profiles go in a scratch folder that git
# ignores, rather than littering tests/.
SHOTS = Path(__file__).resolve().parent / "_output"
SHOTS.mkdir(exist_ok=True)
URL = GAME.joinpath("index.html").as_uri()

# Region checkboxes are in the order they appear in data/states.js, so
# these are the 0-based positions of the ones this gate needs.
NEW_ENGLAND = 0
GREAT_LAKES = 5      # holds Minnesota, the only state with an alternate

problems = []
console = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        problems.append(label + " " + detail)


def start(page, mode, regions=(NEW_ENGLAND,), debug=True, quick=True):
    """Open the game and get a round of `mode` under way. mode is 1-based.

    `quick` shortens the two fade-in waits. They are config values, so
    turning them down is exactly what tuning the game would do - it is
    not the test reaching past the game to poke at its insides. One check
    below deliberately leaves them alone and waits the real 8 seconds.
    """
    page.goto(URL + ("?debug=1" if debug else ""))
    page.wait_for_timeout(300)
    if quick:
        # Shortened, but NOT below the 400ms this function settles for at
        # the end - otherwise the hint has already arrived by the time the
        # round is under way, and "it is not there yet" can never be true.
        page.evaluate("() => { CONFIG.hintDelaySeconds = 1.0;"
                      " CONFIG.skipDelaySeconds = 0.3; }")
    page.click('.game-button[data-game="states"]')
    page.locator("#mode-list button").nth(mode - 1).click()
    page.wait_for_timeout(200)
    for i in regions:
        page.locator("#region-list input").nth(i).check()
    page.wait_for_timeout(250)
    page.click("#start-quiz-button")
    page.wait_for_timeout(400)


def answer(page):
    """What the player has to produce for the question on screen."""
    return page.evaluate(
        "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")


def here(page):
    """The state being asked about, as (abbr, full name)."""
    return page.evaluate("""() => {
        const s = Quiz.getState();
        return s.current ? [s.current.abbr, s.current.name] : [null, null];
    }""")


def typed(page):
    return page.evaluate("() => Quiz.getState().typed")


def pending(page):
    return page.evaluate("() => Quiz.getState().pendingWrong")


def boxes(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('.letter-box')].map(b => b.className)")


def choices(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('.choice-button')]"
        ".map(b => b.dataset.answer)")


def hud(page):
    return (int(page.locator("#hud-points").inner_text()),
            page.locator("#hud-progress").inner_text())


def points(page):
    return hud(page)[0]


def type_rest(page, word=None):
    """Type whatever is still missing from the answer being aimed at."""
    word = word or answer(page)
    for _ in range(len(word) + 4):
        so_far = typed(page)
        # ">=" not "==": dash modes fill in the space between words on
        # their own, so `typed` can run one ahead of the target prefix.
        if len(so_far) >= len(word):
            return
        nxt = word[len(so_far)]
        page.keyboard.press(nxt if nxt != " " else "Space")
        page.wait_for_timeout(45)


def solve_typed(page):
    type_rest(page)
    page.wait_for_timeout(1250)


def solve_choice(page):
    page.locator(f'.choice-button[data-answer="{answer(page)}"]').click()
    page.wait_for_timeout(1250)


def drive_to(page, wanted_abbr, solve, tries=6):
    """Play questions until `wanted_abbr` is the one being asked."""
    for _ in range(tries):
        if page.locator("#screen-quiz.is-active").count() == 0:
            return False
        if here(page)[0] == wanted_abbr:
            return True
        solve(page)
    return False


def point_inside(page, abbr, where=""):
    """A screen point that is genuinely INSIDE a state's shape.

    Same helper as gate6: locator.click() aims at the middle of the
    bounding BOX, and a bent state like Florida has a box whose middle
    is out in the water, or inside the neighbour.
    """
    return page.evaluate("""([abbr, where]) => {
        const el = document.querySelector(`${where}[data-abbr="${abbr}"]`);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const svg = el.ownerSVGElement;
        const toLocal = svg.getScreenCTM().inverse();
        const pt = svg.createSVGPoint();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;

        const found = [];
        const STEPS = 24;
        for (let i = 1; i < STEPS; i++) {
            for (let j = 1; j < STEPS; j++) {
                const x = box.left + (box.width * i) / STEPS;
                const y = box.top + (box.height * j) / STEPS;
                pt.x = x; pt.y = y;
                if (!el.isPointInFill(pt.matrixTransform(toLocal))) continue;
                const hit = document.elementFromPoint(x, y);
                if (!hit || hit.closest('[data-abbr]') !== el) continue;
                found.push([x, y, (x - cx) ** 2 + (y - cy) ** 2]);
            }
        }
        if (!found.length) return null;
        found.sort((a, b) => a[2] - b[2]);
        return [found[0][0], found[0][1]];
    }""", [abbr, where])


def click_state(page, abbr, where=""):
    spot = point_inside(page, abbr, where)
    if not spot:
        problems.append(f"could not find a clickable point inside {where}{abbr}")
        return False
    page.mouse.click(spot[0], spot[1])
    return True


def next_question(page, was, tries=45):
    """Wait until the round has really moved on from the state `was`.

    Not a fixed sleep - see tests/README.md. Answering starts a
    one-second flash during which the map stops listening, and a check
    that sleeps a guessed amount lands in that gap about one run in
    three.
    """
    for _ in range(tries):
        page.wait_for_timeout(100)
        if page.locator("#screen-quiz.is-active").count() == 0:
            return None
        now = page.evaluate("""() => {
            const s = Quiz.getState();
            const live = document.querySelector('#quiz-map svg.us-map.is-clickable');
            return (s.current && live) ? s.current.abbr : null;
        }""")
        if now and now != was:
            return now
    return None


def solve_click(page):
    abbr = here(page)[0]
    click_state(page, abbr)
    return next_question(page, abbr)


with sync_playwright() as p:
    browser = p.chromium.launch(**launch_args())
    page = browser.new_page(viewport={"width": 1280, "height": 1100})
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    cfg = None

    # ============ 1. Every mode is unlocked, and this is v2.0 ============
    # No ?debug=1: debug unlocks everything, which would hide the very
    # thing being checked.
    page.goto(URL)
    page.wait_for_timeout(300)
    cfg = page.evaluate("() => CONFIG")
    FULL = cfg["basePoints"]                            # 5
    HALF = max(0, cfg["basePoints"] - cfg["penaltyPoints"])   # 3

    check("the title screen shows the version",
          page.locator("#version-tag").inner_text() == "v" + cfg["APP_VERSION"],
          page.locator("#version-tag").inner_text())
    # The version LITERAL moves on with each phase; gate8 owns it now.
    # This gate only needs Phase 7's own numbers to be present and right.
    check("examBonusMultiplier arrived with Phase 8",
          cfg.get("examBonusMultiplier") == 2,
          str(cfg.get("examBonusMultiplier")))
    check("the hint still costs exactly one penaltyPoints",
          cfg["penaltyPoints"] == 2, str(cfg["penaltyPoints"]))

    page.click('.game-button[data-game="states"]')
    page.wait_for_timeout(250)
    labels = page.locator("#mode-list button")
    check("all ten modes are on the menu", labels.count() == 10,
          str(labels.count()))
    # The tag is upper-cased by the stylesheet, so compare in one case.
    check("nothing says Coming Soon any more",
          all("coming soon" not in labels.nth(i).inner_text().lower()
              for i in range(10)))
    check("every mode can be clicked",
          all(labels.nth(i).is_enabled() for i in range(10)))
    page.screenshot(path=str(SHOTS / "g7-modes.png"), full_page=True)

    # ============ 2. Mode 4: pick the capital ============
    start(page, 4)
    abbr, name = here(page)

    check("Mode 4 asks 5 questions with 1 region", hud(page)[1] == "1 of 5",
          hud(page)[1])
    check("Mode 4 LIGHTS UP the state - it is the question, not the answer",
          page.locator(".us-map-state.is-highlight").count() == 1)
    check("the prompt asks for the capital",
          "capital" in page.locator("#quiz-prompt").inner_text().lower(),
          page.locator("#quiz-prompt").inner_text())
    check("there are four buttons", len(choices(page)) == 4, str(choices(page)))
    check("the buttons hold capital cities, not state names",
          answer(page) in choices(page)
          and name not in choices(page), str(choices(page)))
    check("no state name is given away anywhere on screen",
          name not in page.locator("#screen-quiz").inner_text(), name)
    page.screenshot(path=str(SHOTS / "g7-mode4.png"), full_page=True)

    solve_choice(page)
    check("a right first pick is worth the full 5", points(page) == FULL,
          str(points(page)))

    # ============ 3. The Hint button ============
    # It appears only after a real try, names the STATE (not the answer),
    # and costs exactly what a skip costs.
    #
    # On a FRESH round, deliberately. Asking "is it there yet?" in the
    # middle of a round meant racing a 0.3s hint timer against a 1s green
    # flash with about 50ms to spare - it passed on a quiet machine and
    # failed on a busy one. That is the guessed-sleep trap tests/README.md
    # warns about. Starting a round is a moment this test actually knows.
    start(page, 4)

    check("the Hint button is not there straight away",
          not page.locator("#quiz-hint").is_visible())

    # Waits for the button itself rather than sleeping a guessed amount.
    hint = page.locator("#quiz-hint")
    try:
        hint.wait_for(state="visible", timeout=4000)
    except Exception:
        pass
    check("it fades in after hintDelaySeconds", hint.is_visible())

    abbr2, name2 = here(page)
    before = points(page)
    page.click("#quiz-hint")
    page.wait_for_timeout(250)

    check("the hint names the STATE, which is what he cannot see",
          name2 in page.locator("#quiz-hint-name").inner_text(),
          page.locator("#quiz-hint-name").inner_text())
    check("it does not give away the capital",
          answer(page) not in page.locator("#quiz-hint-name").inner_text(),
          page.locator("#quiz-hint-name").inner_text())
    check("the button goes away once it has been used",
          not page.locator("#quiz-hint").is_visible())
    check("taking a hint costs nothing up front",
          points(page) == before, str(points(page)))
    page.screenshot(path=str(SHOTS / "g7-hint.png"), full_page=True)

    solve_choice(page)
    check("a hinted answer is worth basePoints - penaltyPoints",
          points(page) - before == HALF,
          str(points(page) - before) + ", expected " + str(HALF))

    # ---- a hint AND a second pick still costs only one penalty ----
    # This is the one the spec calls out: two deductions would land the
    # question on 1 point and feel like a punishment.
    before = points(page)
    right = answer(page)
    page.click("#quiz-hint")   # auto-waits for it to fade in
    page.wait_for_timeout(200)
    wrong_button = [c for c in choices(page) if c != right][0]
    page.locator(f'.choice-button[data-answer="{wrong_button}"]').click()
    page.wait_for_timeout(350)
    check("a wrong pick after a hint still leaves a second chance",
          page.evaluate("() => Quiz.getState().attempts") == 1,
          "attempts = " + str(page.evaluate("() => Quiz.getState().attempts")))

    page.locator(f'.choice-button[data-answer="{right}"]').click()
    page.wait_for_timeout(1250)
    check("hint AND second pick together still cost only one penalty",
          points(page) - before == HALF,
          str(points(page) - before) + " points, expected " + str(HALF)
          + " (not 1 - the penalties must not stack)")

    # ---- and neither hinted question counts as a first-try answer ----
    # Two of the five took help, so three are left. 3 + 3 + 5 + 5 + 5.
    while page.locator("#screen-quiz.is-active").count() == 1:
        solve_choice(page)
    check("hinted questions do not count as first-try",
          page.locator("#summary-firsttry").inner_text() == "3 of 5",
          page.locator("#summary-firsttry").inner_text())
    check("3 + 3 + 5 + 5 + 5 = 21 for that round",
          page.locator("#summary-points").inner_text() == "21",
          page.locator("#summary-points").inner_text())

    # ---- the real 8-second delay, once, un-shortened ----
    start(page, 4, quick=False)
    check("with the shipped config the hint really does wait",
          not page.locator("#quiz-hint").is_visible())
    page.wait_for_timeout(cfg["hintDelaySeconds"] * 1000 + 800)
    check("...and then arrives", page.locator("#quiz-hint").is_visible())

    # ============ 4. A skip costs the SAME as a hint ============
    # "One penalty, one number" - spec section 8.
    start(page, 5)
    skipped, _n = here(page)
    page.wait_for_timeout(1400)   # past both delays, whichever is longer
    check("Mode 5 offers Skip as well as Hint",
          page.locator("#quiz-skip").is_visible()
          and page.locator("#quiz-hint").is_visible())
    page.click("#quiz-skip")
    page.wait_for_timeout(1300)

    check("a skipped question does not count as finished",
          hud(page)[1] == "1 of 5", hud(page)[1])
    if drive_to(page, skipped, solve_typed):
        before = points(page)
        solve_typed(page)
        check("solving a skipped word when it comes back is worth the same"
              " as a hint", points(page) - before == HALF,
              str(points(page) - before) + ", expected " + str(HALF))
    else:
        check("the skipped word came back", False, skipped)

    # ============ 5. Mode 5: spelling a capital ============
    start(page, 5)
    a = answer(page)
    _abbr, name5 = here(page)
    check("Mode 5 spells the CAPITAL, not the state name",
          a != name5 and a == page.evaluate("() => Quiz.getState().current.capital"),
          a + " vs " + name5)
    check("Mode 5 gives away the first letter", typed(page) == a[0],
          repr(typed(page)))
    check("Mode 5 shows one box per letter of the capital",
          len(boxes(page)) == len(a), f"{len(boxes(page))} boxes for {a!r}")
    check("Mode 5 still lights the state up on the map",
          page.locator(".us-map-state.is-highlight").count() == 1)
    page.screenshot(path=str(SHOTS / "g7-mode5.png"), full_page=True)

    solve_typed(page)
    check("spelling a capital correctly scores 5", points(page) == FULL,
          str(points(page)))

    # ============ 6. Saint Paul / St. Paul, the two-spellings case ========
    # The alternates are different LENGTHS, which is what makes this
    # awkward: the row of dashes cannot be counted from one answer.
    start(page, 5, regions=(GREAT_LAKES,))
    if not drive_to(page, "MN", solve_typed):
        check("reached Minnesota in Mode 5", False)
    else:
        check("reached Minnesota in Mode 5", True)
        check("the answer on file is Saint Paul", answer(page) == "Saint Paul",
              answer(page))
        check("10 dashes to start with, one per letter of Saint Paul",
              len(boxes(page)) == 10, str(len(boxes(page))))

        # "t" is wrong for "Saint" and right for "St." - it must be taken,
        # and the row must shorten to match the spelling it commits to.
        page.keyboard.press("t")
        page.wait_for_timeout(200)
        check("typing 't' after 'S' is accepted, because St. Paul is alive",
              typed(page) == "St" and pending(page) == "",
              repr(typed(page)) + " pending " + repr(pending(page)))
        check("the dashes shorten to fit St. Paul", len(boxes(page)) == 8,
              str(len(boxes(page))) + " boxes, expected 8")

        type_rest(page, "St. Paul")
        page.wait_for_timeout(1300)
        check("St. Paul is accepted as fully correct",
              points(page) >= FULL, str(points(page)))
        check("...and it moved on", hud(page)[1] != "1 of 5", hud(page)[1])

    # the long spelling has to work just as well
    start(page, 5, regions=(GREAT_LAKES,))
    if drive_to(page, "MN", solve_typed):
        type_rest(page, "Saint Paul")
        page.wait_for_timeout(1300)
        # here() is used rather than reading current.abbr directly: when
        # Minnesota is the LAST of the five, solving it ends the round and
        # the engine drops `current` to null, which reading .abbr off would
        # throw on. That happens on about one run in five, purely by
        # shuffle - and it did.
        check("Saint Paul is accepted too", here(page)[0] != "MN",
              str(here(page)[0]))

    # and in Mode 6, where he types the space himself
    start(page, 6, regions=(GREAT_LAKES,))
    check("Mode 6 shows no dashes, so the length stays secret",
          len(boxes(page)) == 0, str(len(boxes(page))))
    check("Mode 6 gives no first letter", typed(page) == "", repr(typed(page)))
    if drive_to(page, "MN", solve_typed):
        before = points(page)
        type_rest(page, "St. Paul")
        page.wait_for_timeout(1300)
        check("St. Paul works in Mode 6 as well",
              points(page) - before == FULL,
              str(points(page) - before))
    page.screenshot(path=str(SHOTS / "g7-mode6.png"), full_page=True)

    # ============ 7. Mode 7: pick the 2 letters ============
    start(page, 7)
    check("Mode 7's buttons hold 2-letter codes",
          all(len(c) == 2 and c.isupper() for c in choices(page)),
          str(choices(page)))
    check("Mode 7 lights the state up",
          page.locator(".us-map-state.is-highlight").count() == 1)
    check("Mode 7 offers no hint - the state is right there to look at",
          page.locator("#quiz-helpers").is_hidden())
    for _ in range(5):
        solve_choice(page)
    check("a perfect Mode 7 round scores 25",
          page.locator("#summary-points").inner_text() == "25",
          page.locator("#summary-points").inner_text())

    # ============ 8. Mode 8: BOTH letters must be capitals ============
    start(page, 8)
    code, name8 = here(page)
    check("Mode 8 asks for the 2-letter code", answer(page) == code, answer(page))
    check("Mode 8 shows no dashes", len(boxes(page)) == 0, str(len(boxes(page))))

    page.keyboard.press(code[0].lower())
    page.wait_for_timeout(250)
    check("a lowercase FIRST letter is refused",
          pending(page) == code[0].lower(), repr(pending(page)))
    check("and the reminder says why",
          page.locator("#quiz-tooltip").is_visible()
          and "capital" in page.locator("#quiz-tooltip").inner_text().lower(),
          page.locator("#quiz-tooltip").inner_text())

    page.keyboard.press("Backspace")
    page.keyboard.press(code[0])
    page.wait_for_timeout(200)
    check("the same letter capitalized is accepted", typed(page) == code[0],
          repr(typed(page)))

    # THE Gate 7 check: "me" must not pass for "ME"
    page.keyboard.press(code[1].lower())
    page.wait_for_timeout(250)
    check(f"a lowercase SECOND letter is refused too "
          f"({code[0]}{code[1].lower()} is not {code})",
          pending(page) == code[1].lower(), repr(pending(page)))
    check("and it says so, because an abbreviation is capitals all through",
          page.locator("#quiz-tooltip").is_visible()
          and "capital" in page.locator("#quiz-tooltip").inner_text().lower(),
          page.locator("#quiz-tooltip").inner_text())
    page.screenshot(path=str(SHOTS / "g7-mode8-case.png"), full_page=True)

    page.keyboard.press("Backspace")
    page.keyboard.press(code[1])
    page.wait_for_timeout(1300)
    check("the code typed in capitals is accepted and scores 5",
          points(page) == FULL, str(points(page)))
    check("a wrong CASE cost no points, only backspaces",
          points(page) == FULL, str(points(page)))

    # Mode 8's hint names the state, which is the whole help it can give
    _abbr8, name8b = here(page)
    page.click("#quiz-hint")   # auto-waits for it to fade in
    page.wait_for_timeout(250)
    check("Mode 8's hint names the state",
          name8b in page.locator("#quiz-hint-name").inner_text(),
          page.locator("#quiz-hint-name").inner_text())

    # ============ 9. Mode 10: find the state from its capital ============
    start(page, 10)
    abbr10, name10 = here(page)
    capital10 = answer(page)

    check("Mode 10 reads out the CAPITAL",
          page.locator("#quiz-target").inner_text() == capital10,
          page.locator("#quiz-target").inner_text() + " vs " + capital10)
    check("NOTHING on the map is lit - that would BE the answer",
          page.locator(".us-map-state.is-highlight").count() == 0)
    check("and the state's name is nowhere on screen either",
          name10 not in page.locator("#screen-quiz").inner_text(), name10)
    check("no ring pointing at anything",
          page.evaluate("""() => {
              const r = document.querySelector('.us-map-ring');
              return !r || getComputedStyle(r).display === 'none';
          }"""))
    check("Mode 10 offers no hint - the hint names the state, which IS"
          " the answer here", page.locator("#quiz-helpers").is_hidden())
    check("the map is switched on for clicking",
          page.locator("#quiz-map svg.us-map.is-clickable").count() == 1)
    check("the zoom panel is there too, same as Mode 9",
          page.locator("#quiz-zoom .us-map-zoom").count() == 1)
    page.screenshot(path=str(SHOTS / "g7-mode10.png"), full_page=True)

    click_state(page, abbr10)
    page.wait_for_timeout(400)
    check("clicking the right state scores the full 5", points(page) == FULL,
          str(points(page)))
    next_question(page, abbr10)

    # wrong twice: the reveal has to name the STATE, not repeat the city
    abbr11, name11 = here(page)
    others = page.evaluate("""(a) => USMap.getAbbrs()
        .filter(x => x !== a).slice(0, 2)""", abbr11)
    click_state(page, others[0])
    page.wait_for_timeout(350)
    check("a wrong click leaves the second chance intact",
          page.evaluate("() => Quiz.getState().attempts") == 1)
    click_state(page, others[1])
    page.wait_for_timeout(500)

    reveal = page.locator("#quiz-feedback").inner_text()
    check("the reveal names the STATE, which is the thing he had to find",
          name11 in reveal, reveal)
    check("and ties the capital back to it", answer(page) in reveal, reveal)
    check("the right state is shown in green",
          page.evaluate("(a) => document.querySelector(`[data-abbr=\"${a}\"]`)"
                        ".getAttribute('class').includes('is-correct')", abbr11))
    page.screenshot(path=str(SHOTS / "g7-mode10-reveal.png"), full_page=True)

    next_question(page, abbr11)
    while page.locator("#screen-quiz.is-active").count() == 1:
        if solve_click(page) is None:
            break
    page.wait_for_timeout(400)
    check("Mode 10 ends the round properly",
          page.locator("#screen-summary.is-active").count() == 1)
    check("the map stops listening when a Mode 10 round ends",
          page.locator("svg.us-map.is-clickable").count() == 0)
    check("and the zoom panel is taken off the page",
          page.locator(".us-map-zoom").count() == 0)

    # ============ 10. A perfect round of each new mode ============
    for mode, solve in [(4, solve_choice), (5, solve_typed), (6, solve_typed),
                        (7, solve_choice), (8, solve_typed)]:
        start(page, mode)
        for _ in range(5):
            if page.locator("#screen-quiz.is-active").count() == 0:
                break
            solve(page)
        check(f"a perfect Mode {mode} round scores exactly 25",
              page.locator("#summary-points").inner_text() == "25",
              page.locator("#summary-points").inner_text())
        check(f"Mode {mode}: 25 points becomes 25 seconds of running",
              page.locator("#summary-seconds").inner_text() == "25")

    # ============ 11. The older modes are untouched ============
    page2 = browser.new_page(viewport={"width": 1280, "height": 1100})
    page2.on("pageerror", lambda e: problems.append("map-test pageerror: " + str(e)))
    page2.goto(GAME.joinpath("map-test.html").as_uri())
    page2.wait_for_timeout(400)
    check("Gate 1: map-test still reports no failures",
          page2.locator(".check-fail").count() == 0)

    start(page2, 1)
    check("Gate 2: Mode 1 still asks for the state name",
          answer(page2) == page2.evaluate("() => Quiz.getState().current.name"))
    check("Gate 2: Mode 1 offers no hint",
          page2.locator("#quiz-helpers").is_hidden())
    for _ in range(5):
        solve_choice(page2)
    check("Gate 2: a perfect Mode 1 round still scores 25",
          page2.locator("#summary-points").inner_text() == "25",
          page2.locator("#summary-points").inner_text())

    start(page2, 2)
    check("Gate 3: Mode 2 still gives away the first letter of the state",
          typed(page2) == answer(page2)[0], repr(typed(page2)))
    solve_typed(page2)
    check("Gate 3: spelling a state still scores 5", points(page2) == FULL,
          str(points(page2)))

    start(page2, 9)
    check("Gate 6: Mode 9 still reads out the state name",
          page2.locator("#quiz-target").inner_text() ==
          page2.evaluate("() => Quiz.getState().current.name"))
    check("Gate 6: Mode 9 still lights nothing up",
          page2.locator(".us-map-state.is-highlight").count() == 0)

    browser.close()

bad = [c for c in console
       if c.startswith(("error", "warning")) and not is_noise(c)]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 7: ALL CHECKS PASSED" if not problems
                 else "GATE 7: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if problems:
    sys.exit(1)
