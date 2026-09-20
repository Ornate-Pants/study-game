"""Drive Mode 9 (click the state on the map) in Chrome and check Gate 6."""
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

# Mode 9 is the ninth button on the Pick a Game screen.
MODE_9 = 9

problems = []
console = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        problems.append(label + " " + detail)


def start(page, mode, regions=(0,), debug=True):
    """Open the game and get a round of `mode` under way. mode is 1-based."""
    page.goto(URL + ("?debug=1" if debug else ""))
    page.wait_for_timeout(300)
    page.click('.game-button[data-game="states"]')
    page.locator("#mode-list button").nth(mode - 1).click()
    page.wait_for_timeout(200)
    for i in regions:
        page.locator("#region-list input").nth(i).check()
    page.wait_for_timeout(250)
    page.click("#start-quiz-button")
    page.wait_for_timeout(400)


def target(page):
    """The state being asked for right now, as (abbr, name)."""
    return page.evaluate("""() => {
        const s = Quiz.getState();
        return [s.current.abbr, s.current[s.rules.asks]];
    }""")


def hud(page):
    return (int(page.locator("#hud-points").inner_text()),
            page.locator("#hud-progress").inner_text())


def looks(page, abbr):
    """The class list on one state's shape."""
    return page.evaluate(
        "(a) => document.querySelector(`[data-abbr=\"${a}\"]`).getAttribute('class')",
        abbr)


def point_inside(page, abbr, where=""):
    """A screen point that is genuinely INSIDE a state's shape.

    `where` narrows it to one map: pass ".us-map-zoom " for the copy in
    the zoom panel, or nothing for the state on the big map.

    Not locator.click(): that aims at the middle of the shape's bounding
    BOX, and a bent state like Florida or Michigan has a box whose middle
    is out in the water - or, worse, inside the neighbour. So the shape is
    asked directly (isPointInFill), and the browser is asked a second time
    which element actually sits under that point, which is the same
    question the real mouse asks.

    Walks a grid and takes the qualifying point nearest the middle, so
    the same state is clicked in the same spot every run.
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
    """A real mouse click, landing inside the named state."""
    spot = point_inside(page, abbr, where)
    if not spot:
        problems.append(f"could not find a clickable point inside {where}{abbr}")
        return False
    page.mouse.click(spot[0], spot[1])
    return True


def eventually(page, probe, tries=12, gap=80):
    """Poll a browser-side test until it comes true, or give up.

    For anything that is only briefly true. The green flash on a right
    answer lasts feedbackSeconds and is then wiped for the next
    question, so a check that samples once at a guessed moment can miss
    it from either side - and did, about one run in three.
    """
    for _ in range(tries):
        if page.evaluate(probe):
            return True
        page.wait_for_timeout(gap)
    return False


def wearing(abbr, look, where=""):
    """A probe: is every copy of this state wearing this class?"""
    return ("""() => { const all = [...document.querySelectorAll('"""
            + where + '[data-abbr="' + abbr + """"]')];
        return all.length > 0 && all.every(e =>
            (e.getAttribute('class') || '').includes('""" + look + "')); }")


def next_question(page, was, tries=45):
    """Wait until the round has really moved on from the state `was`.

    Not a fixed sleep. Answering a question starts a one-second flash
    before the next one appears, and clicking is switched off for the
    whole of it - so a test that sleeps a guessed amount and then clicks
    sometimes clicks into that gap and nothing happens at all. This
    waits for the thing itself: a different state, being asked, with the
    map listening again.

    Returns the new state's abbr, or None once the round is over.
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


def answer_question(page):
    """Click the right state, then wait for the round to move on."""
    abbr, _name = target(page)
    click_state(page, abbr)
    return next_question(page, abbr)


def widths(page, abbr):
    """(on the big map, in the zoom panel) - how wide that state is drawn."""
    return page.evaluate("""(abbr) => ['', '.us-map-zoom '].map(w => {
        const el = document.querySelector(`${w}[data-abbr="${abbr}"]`);
        return el ? Math.round(el.getBoundingClientRect().width) : 0;
    })""", abbr)


def some_other_state(page, abbr, avoid=()):
    """Any state that is not the answer (and not one already used)."""
    return page.evaluate("""([abbr, avoid]) =>
        USMap.getAbbrs().find(a => a !== abbr && !avoid.includes(a))""",
        [abbr, list(avoid)])


with sync_playwright() as p:
    browser = p.chromium.launch(**launch_args())
    page = browser.new_page(viewport={"width": 1280, "height": 1100})
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    # ============ 1. The mode is unlocked, and the version says 1.1 =========
    # No ?debug=1 here: debug unlocks everything, which would hide the
    # very thing being checked.
    page.goto(URL)
    page.wait_for_timeout(300)
    check("the title screen shows the version",
          page.locator("#version-tag").inner_text() ==
          "v" + page.evaluate("() => CONFIG.APP_VERSION"),
          page.locator("#version-tag").inner_text())
    # The version LITERAL belongs to gate7 now, which is the gate for the
    # build that carries it. Here it only has to be consistent with itself.

    page.click('.game-button[data-game="states"]')
    page.wait_for_timeout(200)
    mode9 = page.locator("#mode-list button").nth(MODE_9 - 1)
    check("Mode 9 is on the menu", "Find the State" in mode9.inner_text(),
          mode9.inner_text().replace("\n", " "))
    # The label is upper-cased by the stylesheet, so compare in one case.
    soon = lambda i: "coming soon" in (
        page.locator("#mode-list button").nth(i).inner_text().lower())

    check("Mode 9 is no longer Coming Soon",
          mode9.is_enabled() and not soon(MODE_9 - 1),
          mode9.inner_text().replace("\n", " "))
    # This used to read "Modes 4-8 and 10 are still Coming Soon". Phase 7
    # built them, so the thing worth checking flipped over: nothing is
    # locked any more. gate7 checks that in full.

    # ============ 2. The map must NOT give the answer away ============
    start(page, MODE_9)
    abbr, name = target(page)

    check("Mode 9 asks 5 questions with 1 region", hud(page)[1] == "1 of 5",
          hud(page)[1])
    check("NOTHING on the map is lit up - that would BE the answer",
          page.locator(".us-map-state.is-highlight").count() == 0,
          str(page.locator(".us-map-state.is-highlight").count()) + " lit")
    check("no 'look here' ring either",
          page.evaluate("""() => {
              const r = document.querySelector('.us-map-ring');
              return !r || getComputedStyle(r).display === 'none';
          }"""))
    check("no state is coloured at all at the start of a question",
          page.evaluate("""() => [...document.querySelectorAll('.us-map-state')]
              .every(e => !/is-(highlight|correct|wrong)|region-/.test(e.getAttribute('class')))"""))

    # ============ 3. The question is READ instead ============
    check("the state name is shown as text", page.locator("#quiz-target").is_visible())
    check("and it is the state being asked for",
          page.locator("#quiz-target").inner_text() == name,
          page.locator("#quiz-target").inner_text() + " vs " + name)
    check("there are no answer buttons in this mode",
          page.locator("#quiz-choices").is_hidden()
          and page.locator("#quiz-typing").is_hidden())
    check("the backspace row stays out of the way",
          page.locator("#hud-backspaces").is_hidden())

    # ============ 4. The map looks clickable ============
    check("the map is switched on for clicking",
          page.locator("#quiz-map svg.us-map.is-clickable").count() == 1)
    check("the mouse gets a pointer over a state",
          page.evaluate("""() => getComputedStyle(
              document.querySelector('.us-map-state')).cursor""") == "pointer")
    check("the map gets the extra room a click mode needs",
          page.evaluate("() => document.body.classList.contains('is-map-click')"))
    page.screenshot(path=str(SHOTS / "g6-question.png"), full_page=True)

    # ============ 5. The right click scores 5 and moves on ============
    click_state(page, abbr)
    check("clicking the right state turns it green",
          eventually(page, wearing(abbr, "is-correct")), looks(page, abbr))
    check("a right first click is worth the full 5", hud(page)[0] == 5,
          str(hud(page)))
    abbr2 = next_question(page, abbr)
    check("it moves on by itself", hud(page)[1] == "2 of 5", hud(page)[1])
    check("and the green is cleared off for the next question",
          page.locator(".us-map-state.is-correct").count() == 0)

    # ============ 6. A wrong click: red, no points, still your question ====
    wrong = some_other_state(page, abbr2)
    click_state(page, wrong)
    page.wait_for_timeout(400)

    check("a wrong click turns THAT state red", "is-wrong" in looks(page, wrong),
          looks(page, wrong))
    check("a wrong click costs nothing", hud(page)[0] == 5, str(hud(page)))
    check("the question does not move on", hud(page)[1] == "2 of 5", hud(page)[1])
    check("the answer is still not shown",
          page.locator(".us-map-state.is-correct").count() == 0)
    check("the screen says to try again",
          "again" in page.locator("#quiz-feedback").inner_text().lower(),
          page.locator("#quiz-feedback").inner_text())
    page.screenshot(path=str(SHOTS / "g6-wrong-click.png"), full_page=True)

    # the same wrong state again is dead, exactly like a greyed-out button
    click_state(page, wrong)
    page.wait_for_timeout(300)
    check("clicking the same wrong state again does nothing",
          page.evaluate("() => Quiz.getState().attempts") == 1,
          "attempts = " + str(page.evaluate("() => Quiz.getState().attempts")))
    check("and it has not thrown away the second chance",
          page.evaluate("() => Quiz.getState().current.abbr") == abbr2)

    # ============ 7. Right on the second click is worth 3, not 5 ============
    click_state(page, abbr2)
    page.wait_for_timeout(500)
    check("right on the second click is worth 3, not 5",
          hud(page)[0] == 8, str(hud(page)) + " (5 + 3 expected)")
    next_question(page, abbr2)

    # ============ 8. Wrong twice: reveal, no points, never asked again =====
    abbr3, name3 = target(page)
    w1 = some_other_state(page, abbr3)
    w2 = some_other_state(page, abbr3, avoid=[w1])

    click_state(page, w1)
    page.wait_for_timeout(350)
    click_state(page, w2)
    page.wait_for_timeout(500)

    check("wrong twice scores nothing", hud(page)[0] == 8, str(hud(page)))
    check("both wrong states are red",
          "is-wrong" in looks(page, w1) and "is-wrong" in looks(page, w2),
          looks(page, w1) + " | " + looks(page, w2))
    check("the right state is revealed in green",
          "is-correct" in looks(page, abbr3), looks(page, abbr3))
    check("a ring points at it, because the map was blank until now",
          page.evaluate("""() => {
              const r = document.querySelector('.us-map-ring');
              return !!r && getComputedStyle(r).display !== 'none';
          }"""))
    check("the answer is read out on screen",
          name3 in page.locator("#quiz-feedback").inner_text(),
          page.locator("#quiz-feedback").inner_text())
    check("clicking is switched off while the answer is up",
          page.locator("svg.us-map.is-clickable").count() == 0)
    page.screenshot(path=str(SHOTS / "g6-reveal.png"), full_page=True)

    next_question(page, abbr3)
    check("it moves on after the reveal", hud(page)[1] == "4 of 5", hud(page)[1])

    # play out the rest; the blown question must never come back
    rest = []
    for _ in range(2):
        a, _n = target(page)
        rest.append(a)
        answer_question(page)

    check("a missed question is not asked again", abbr3 not in rest,
          abbr3 + " in " + str(rest))
    check("5 questions, one blown, one second-chance = 18 points",
          page.locator("#summary-points").inner_text() == "18",
          page.locator("#summary-points").inner_text())
    check("the summary counts 3 of 5 on the first try",
          page.locator("#summary-firsttry").inner_text() == "3 of 5",
          page.locator("#summary-firsttry").inner_text())

    # ============ 9. The map stops listening when the round ends ============
    check("the map is not clickable any more",
          page.locator("svg.us-map.is-clickable").count() == 0)
    check("the extra map room is given back",
          not page.evaluate("() => document.body.classList.contains('is-map-click')"))
    check("the question text is put away",
          page.locator("#quiz-target").is_hidden())

    # ============ 10. A perfect round scores 25 ============
    start(page, MODE_9)
    for _ in range(5):
        answer_question(page)
    check("a perfect 5-question round scores exactly 25",
          page.locator("#summary-points").inner_text() == "25",
          page.locator("#summary-points").inner_text())
    check("25 points becomes 25 seconds of running",
          page.locator("#summary-seconds").inner_text() == "25")

    # ============ 11. The map is inert on the other screens ============
    # There is only ONE map and it is MOVED from screen to screen, so a
    # listener left switched on would answer questions nobody is asking.
    page.goto(URL + "?debug=1")
    page.wait_for_timeout(300)
    page.click('.game-button[data-game="states"]')
    page.locator("#mode-list button").nth(MODE_9 - 1).click()
    page.wait_for_timeout(300)
    check("the map on Pick Your Regions is not clickable",
          page.locator("svg.us-map.is-clickable").count() == 0)
    click_state(page, "ME")
    page.wait_for_timeout(250)
    check("clicking a state there does nothing at all",
          page.locator("#screen-region-select.is-active").count() == 1
          and page.locator(".us-map-state.is-wrong").count() == 0)

    # and the other modes are untouched by any of this
    start(page, 1)
    check("Mode 1 still lights up the state it is asking about",
          page.locator(".us-map-state.is-highlight").count() == 1)
    check("Mode 1's map is not clickable",
          page.locator("svg.us-map.is-clickable").count() == 0)
    check("Mode 1 does not show the click-mode question text",
          page.locator("#quiz-target").is_hidden())

    # ============ 12. The zoom panel, which is what Gate 6 is about ========
    # The Gate 6 play test found the small states findable but too fiddly
    # to click, so the six worst get a bigger view of their own.
    start(page, MODE_9, regions=(0, 1))
    SMALL = ["RI", "MD", "DE", "CT", "MA", "NJ"]

    check("the zoom panel is on screen in a click round",
          page.locator("#quiz-zoom .us-map-zoom").count() == 1)
    # The label was reworded after Gate 7 ("The small states, bigger" ->
    # "Northeastern Corridor - Zoom"). What matters is that the panel says
    # what it is for, not the exact words.
    check("it says what it is",
          "zoom" in page.locator(".zoom-label").inner_text().lower(),
          page.locator(".zoom-label").inner_text())
    check("it holds all six of the small states",
          all(page.locator(f'.us-map-zoom [data-abbr="{a}"]').count() == 1
              for a in SMALL))
    check("and their neighbours, so they are not floating in space",
          all(page.locator(f'.us-map-zoom [data-abbr="{a}"]').count() == 1
              for a in ["NY", "PA", "VA", "NH"]))
    check("the lines between the states are copied too, or it is one blob",
          page.locator(".us-map-zoom .us-map-borders path").count() > 5,
          str(page.locator(".us-map-zoom .us-map-borders path").count()) + " lines")

    # An id may be used once per page. The copies must have given theirs up.
    check("the copies gave up their ids, so no id is used twice",
          page.evaluate("""() => ['RI', 'MD', 'DE', 'CT', 'MA', 'NJ']
              .every(a => document.querySelectorAll('#' + a).length === 1)"""))

    sizes = [[a] + widths(page, a) for a in SMALL]
    check("every small state is far bigger in the panel than on the map",
          all(z >= 2 * m for _a, m, z in sizes), str(sizes))
    check("and each is a comfortable target, 28px across or more",
          all(z >= 28 for _a, _m, z in sizes), str(sizes))
    page.screenshot(path=str(SHOTS / "g6-zoom-panel.png"), full_page=True)

    # ---- clicking in the panel answers the question ----
    # Drive the round to one of the six, then answer it from the panel.
    for _ in range(10):
        abbr4, name4 = target(page)
        if abbr4 in SMALL:
            break
        if answer_question(page) is None:
            break

    check("reached one of the small states", abbr4 in SMALL, abbr4)
    if abbr4 in SMALL:
        before = hud(page)[0]
        wrong4 = "MA" if abbr4 != "MA" else "CT"

        click_state(page, wrong4, ".us-map-zoom ")
        page.wait_for_timeout(400)
        check("a wrong click in the panel counts as a wrong click",
              page.evaluate("() => Quiz.getState().attempts") == 1,
              "attempts = " + str(page.evaluate("() => Quiz.getState().attempts")))
        check("and it turns red in BOTH views, not just the one clicked",
              page.evaluate("""(a) => [...document.querySelectorAll(
                  `[data-abbr="${a}"]`)].every(e =>
                  e.getAttribute('class').includes('is-wrong'))""", wrong4))
        page.screenshot(path=str(SHOTS / "g6-zoom-wrong.png"), full_page=True)

        click_state(page, abbr4, ".us-map-zoom ")
        check("and it goes green in both views",
              eventually(page, wearing(abbr4, "is-correct")),
              looks(page, abbr4))
        check("clicking the right state in the panel answers the question",
              hud(page)[0] == before + 3,
              str(hud(page)[0] - before) + " points for a second-chance answer")
        next_question(page, abbr4)

    # ---- and it is taken off the page when it is not in use ----
    page.evaluate("() => Quiz.endRoundNow()")
    page.wait_for_timeout(400)
    check("the panel is taken off the page when the round ends",
          page.locator(".us-map-zoom").count() == 0)

    start(page, 1)
    check("Mode 1 never shows the panel",
          page.locator(".us-map-zoom").count() == 0)

    # ---- and it can be switched off entirely ----
    page.goto(URL + "?debug=1")
    page.wait_for_timeout(300)
    page.evaluate("() => { CONFIG.zoomSmallStates = false; }")
    page.click('.game-button[data-game="states"]')
    page.locator("#mode-list button").nth(MODE_9 - 1).click()
    page.wait_for_timeout(200)
    page.locator("#region-list input").nth(0).check()
    page.wait_for_timeout(250)
    page.click("#start-quiz-button")
    page.wait_for_timeout(400)
    check("zoomSmallStates: false turns the panel off",
          page.locator(".us-map-zoom").count() == 0)
    check("and the game is still perfectly playable without it",
          page.locator("svg.us-map.is-clickable").count() == 1)

    # ============ 13. Gates 1 and 2 still pass ============
    page2 = browser.new_page(viewport={"width": 1100, "height": 1200})
    page2.on("pageerror", lambda e: problems.append("map-test pageerror: " + str(e)))
    page2.goto(GAME.joinpath("map-test.html").as_uri())
    page2.wait_for_timeout(400)
    check("Gate 1: map-test still reports no failures",
          page2.locator(".check-fail").count() == 0)

    start(page2, 1)
    check("Gate 2: Mode 1 still asks 5 questions", hud(page2)[1] == "1 of 5",
          hud(page2)[1])
    for _ in range(5):
        want = page2.evaluate(
            "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")
        page2.locator(f'.choice-button[data-answer="{want}"]').click()
        page2.wait_for_timeout(1300)
    check("Gate 2: a perfect Mode 1 round still scores 25",
          page2.locator("#summary-points").inner_text() == "25",
          page2.locator("#summary-points").inner_text())

    browser.close()

bad = [c for c in console
       if c.startswith(("error", "warning")) and not is_noise(c)]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 6: ALL CHECKS PASSED" if not problems
                 else "GATE 6: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if problems:
    sys.exit(1)
