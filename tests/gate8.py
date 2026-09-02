"""Drive Exam Mode in Chrome and check Gate 8.

Exam Mode is a switch, not a mode: it can be turned on for any of the
ten games. What this gate is really for, in the spec's words:

  * nothing gives the answer away mid-round
  * the review screen matches what was actually answered
  * the per-region tally adds up
  * the doubled bonus lands ONCE, on the results screen
  * an exam high score is marked as one

The first of those is the one worth being fussy about, and it is checked
in more places than the colours: the sounds, the running score, and the
letter-by-letter checking are all feedback too.
"""
import sys
from playwright.sync_api import sync_playwright
from pathlib import Path

# Where the game is, worked out from where THIS file is, so the
# suite keeps working if the project is moved or cloned somewhere else.
GAME = Path(__file__).resolve().parent.parent / "state-quest"

# Screenshots and browser profiles go in a scratch folder that git
# ignores, rather than littering tests/.
SHOTS = Path(__file__).resolve().parent / "_output"
SHOTS.mkdir(exist_ok=True)
URL = GAME.joinpath("index.html").as_uri()

# Region checkboxes, in the order they appear in data/states.js.
NEW_ENGLAND = 0
GREAT_LAKES = 5      # holds Minnesota, the only state with an alternate

problems = []
console = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        problems.append(label + " " + detail)


def start(page, mode, exam=True, regions=(NEW_ENGLAND,), quick=True, debug=True):
    """Open the game and get a round of `mode` under way. mode is 1-based.

    debug=False matters for one section below: ?debug=1 deliberately
    prints the answer on screen, so the "nothing gives the answer away"
    checks have to be made against the game as it actually ships.
    """
    page.goto(URL + ("?debug=1" if debug else ""))
    page.wait_for_timeout(300)
    if quick:
        # Config values, so turning them down is an ordinary thing to do.
        page.evaluate("() => { CONFIG.skipDelaySeconds = 0.3;"
                      " CONFIG.hintDelaySeconds = 0.3; }")
    page.click("#start-button")
    page.locator("#mode-list button").nth(mode - 1).click()
    page.wait_for_timeout(200)
    for i in regions:
        page.locator("#region-list input").nth(i).check()
    if exam:
        page.locator("#exam-toggle").check()
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


def hud(page):
    return page.locator("#hud-progress").inner_text()


def points(page):
    """The score kept underneath. NOT shown on screen during an exam."""
    return page.evaluate("() => Quiz.getState().points")


def record(page):
    return page.evaluate("() => Quiz.getState().record")


def marked(page):
    """Anything on screen claiming an answer is right or wrong."""
    return page.locator(".is-correct, .is-wrong").count()


def screen_text(page):
    return page.locator("#screen-quiz").inner_text()


def put(page, text):
    """Type into the exam box the way a person does, keystroke by keystroke.

    Not fill(): the whole point of the exam typing box is that the
    document-level key handler leaves it alone. fill() sets the value
    directly and would sail past that bug completely.
    """
    box = page.locator("#exam-input")
    box.click()
    page.keyboard.type(text)
    page.wait_for_timeout(60)


def submit(page):
    page.click("#exam-submit")
    page.wait_for_timeout(350)


def point_inside(page, abbr, where=""):
    """A screen point genuinely INSIDE a state's shape. Same as gate6/7:
    locator.click() aims at the middle of the bounding BOX, which for a
    bent state can be out in the water or inside the neighbour."""
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
    page.wait_for_timeout(200)
    return True


def looks(page, abbr):
    return page.evaluate(
        "(a) => document.querySelector(`[data-abbr=\"${a}\"]`).getAttribute('class')",
        abbr)


def other_state(page, abbr):
    return page.evaluate("(a) => USMap.getAbbrs().find(x => x !== a)", abbr)


def play_out(page, how):
    """Finish the round, answering every remaining question correctly."""
    guard = 0
    while page.locator("#screen-quiz.is-active").count() == 1 and guard < 60:
        guard += 1
        how(page)


def answer_typed(page):
    put(page, answer(page))
    submit(page)


def answer_choice(page):
    page.locator(f'.choice-button[data-answer="{answer(page)}"]').click()
    page.wait_for_timeout(120)
    submit(page)


def answer_click(page):
    click_state(page, here(page)[0])
    submit(page)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 1100})
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    # ============ 1. The version, and the config value ============
    page.goto(URL)
    page.wait_for_timeout(300)
    cfg = page.evaluate("() => CONFIG")
    FULL = cfg["basePoints"]

    check("the title screen shows the version",
          page.locator("#version-tag").inner_text() == "v" + cfg["APP_VERSION"],
          page.locator("#version-tag").inner_text())
    check("the version is 2.1", cfg["APP_VERSION"] == "2.1", cfg["APP_VERSION"])
    check("examBonusMultiplier is here now, and it is 2",
          cfg.get("examBonusMultiplier") == 2,
          str(cfg.get("examBonusMultiplier")))

    # ============ 2. The switch, on Pick Your Regions ============
    page.click("#start-button")
    page.locator("#mode-list button").nth(0).click()
    page.wait_for_timeout(250)

    check("the exam switch is on the Pick Your Regions screen",
          page.locator("#exam-toggle").is_visible())
    check("it sits BELOW the region checkboxes", page.evaluate("""() => {
              const list = document.getElementById('region-list');
              const toggle = document.getElementById('exam-toggle-label');
              return list.getBoundingClientRect().bottom
                  <= toggle.getBoundingClientRect().top + 2;
          }"""))
    check("it starts switched off",
          not page.locator("#exam-toggle").is_checked())

    page.locator("#region-list input").nth(NEW_ENGLAND).check()
    page.wait_for_timeout(200)
    practice_line = page.locator("#region-summary").inner_text()
    check("a practice round says 10 bonus points for one region",
          "10 bonus" in practice_line, practice_line)

    page.locator("#exam-toggle").check()
    page.wait_for_timeout(200)
    exam_line = page.locator("#region-summary").inner_text()
    check("switching it on doubles the bonus on the line",
          "20 bonus" in exam_line, exam_line)
    check("and the line says it is an exam", "Exam" in exam_line, exam_line)
    page.screenshot(path=str(SHOTS / "g8-toggle.png"), full_page=True)

    # ============ 3. A typed exam: no checking, no marking, no score ======
    start(page, 5)          # Capital Speller
    abbr, name = here(page)
    capital = answer(page)

    check("the exam flag reached the engine",
          page.evaluate("() => Quiz.getState().exam") is True)
    check("the letter boxes are gone", page.locator("#quiz-typing").is_hidden())
    check("a plain text box takes their place",
          page.locator("#exam-input").is_visible())
    check("the running score is hidden - a rising total IS feedback",
          page.locator("#hud-points-item").is_hidden())
    check("an EXAM marker takes its place",
          page.locator("#hud-exam").is_visible())
    check("no backspace ration - it is free and unlimited in an exam",
          page.locator("#hud-backspaces").is_hidden())
    check("no Hint button, in a mode that has one in practice",
          page.locator("#quiz-helpers").is_hidden())
    check("the map still lights the state up - that is the QUESTION",
          page.locator(".us-map-state.is-highlight").count() == 1)
    page.screenshot(path=str(SHOTS / "g8-typed.png"), full_page=True)

    # the trap: the document key handler must leave the box alone
    put(page, "Zzz")
    check("he can actually type into the box",
          page.locator("#exam-input").input_value() == "Zzz",
          repr(page.locator("#exam-input").input_value()))
    check("a wrong letter is accepted in silence - no red, no shake",
          marked(page) == 0 and page.locator(".letter-box.is-wrong").count() == 0)
    check("nothing is said about it",
          page.locator("#quiz-feedback").inner_text().strip() == "",
          repr(page.locator("#quiz-feedback").inner_text()))

    # backspace is ordinary typing correction here, with no limit
    for _ in range(8):
        page.keyboard.press("Backspace")
    page.wait_for_timeout(150)
    check("backspace is free and unlimited",
          page.locator("#exam-input").input_value() == "",
          repr(page.locator("#exam-input").input_value()))
    check("and the question is still his",
          page.evaluate("() => Quiz.getState().current.abbr") == abbr)

    check("Submit is refused while the box is empty",
          not page.locator("#exam-submit").is_enabled())
    put(page, "Nonsense")
    check("and offered once something is written",
          page.locator("#exam-submit").is_enabled())

    submit(page)
    check("submitting a wrong answer says nothing at all",
          marked(page) == 0
          and page.locator("#quiz-feedback").inner_text().strip() == "",
          repr(page.locator("#quiz-feedback").inner_text()))
    check("it moves straight on, with no green-flash pause",
          hud(page) == "2 of 5", hud(page))
    check("a wrong answer scored nothing", points(page) == 0, str(points(page)))

    rows = record(page)
    check("what he actually answered is written down",
          len(rows) == 1 and rows[0]["given"] == "Nonsense"
          and rows[0]["right"] is False, str(rows))
    check("...along with the right answer, for the review screen",
          rows[0]["correct"] == capital, str(rows[0]))

    # Enter submits too
    want = answer(page)
    put(page, want)
    page.keyboard.press("Enter")
    page.wait_for_timeout(350)
    check("Enter submits", hud(page) == "3 of 5", hud(page))
    check("a right answer is worth the full basePoints",
          points(page) == FULL, str(points(page)))

    # ============ 3b. NOTHING GIVES THE ANSWER AWAY ============
    # The headline requirement of Gate 8, and it has to be checked on the
    # game as it SHIPS. ?debug=1 prints the answer on screen on purpose,
    # so every check here runs without it.
    # Which words must not be readable in each mode. The state NAME is on
    # every list: it is what the Hint button reveals in practice, and from
    # it the two-letter code is a short step. Mode 10 is the exception in
    # reverse - there the capital IS the question, so only the name is
    # secret.
    for mode, secrets in [(5, ["capital", "name"]), (6, ["capital", "name"]),
                          (8, ["name"]), (10, ["name"])]:
        start(page, mode, debug=False)

        for field in secrets:
            word = page.evaluate("(f) => Quiz.getState().current[f]", field)
            check(f"Mode {mode} exam: the {field} is nowhere on screen",
                  word not in screen_text(page), "looked for " + repr(word))

        # Mode 8's answer is two letters, too short to hunt for as a
        # substring without tripping over ordinary words. Asked precisely
        # instead: is any element on the screen just that code and nothing
        # else?
        if mode == 8:
            code = here(page)[0]
            check("Mode 8 exam: no element on screen is just the code",
                  page.evaluate("""(c) => ![...document.querySelectorAll(
                      '#screen-quiz *')].some(e => e.textContent.trim() === c)""",
                      code), code)

        check(f"Mode {mode} exam: nothing is marked right or wrong",
              marked(page) == 0)
        check(f"Mode {mode} exam: the debug answer line is off",
              page.locator("#quiz-debug-answer").is_hidden())

        # ...and it stays that way after a deliberately wrong answer.
        if mode == 10:
            click_state(page, other_state(page, here(page)[0]))
        else:
            put(page, "Qqqq")
        submit(page)
        check(f"Mode {mode} exam: still nothing marked after a wrong answer",
              marked(page) == 0
              and page.locator("#quiz-feedback").inner_text().strip() == "",
              repr(page.locator("#quiz-feedback").inner_text()))

    page.screenshot(path=str(SHOTS / "g8-no-answers.png"), full_page=True)

    # Back to a debug round for the rest, which needs to see inside.
    start(page, 5)
    put(page, "Nonsense")
    submit(page)
    put(page, answer(page))
    submit(page)

    # ============ 4. Skip is final in an exam ============
    skipped_abbr, _n = here(page)
    page.wait_for_timeout(600)
    check("Skip is offered", page.locator("#exam-skip").is_visible())
    page.click("#exam-skip")
    page.wait_for_timeout(350)

    check("a skip counts as FINISHED with - nothing comes back",
          hud(page) == "4 of 5", hud(page))
    check("nothing was put in the come-back queue",
          page.evaluate("() => Quiz.getState().comeBack").__len__() == 0)
    rows = record(page)
    check("the skip is written down as a skip",
          rows[-1]["skipped"] is True and rows[-1]["given"] == "",
          str(rows[-1]))
    check("a skipped question still records the right answer",
          rows[-1]["correct"] != "", str(rows[-1]))

    play_out(page, answer_typed)
    check("the skipped question was never asked again",
          [r["abbr"] for r in record(page)].count(skipped_abbr) == 1,
          str([r["abbr"] for r in record(page)]))
    check("every question appears exactly once",
          len(record(page)) == 5 and len(set(r["abbr"] for r in record(page))) == 5)

    # ============ 5. The review screen ============
    check("the review is shown", page.locator("#exam-review").is_visible())
    check("one row per question", page.locator(".review-row").count() == 5,
          str(page.locator(".review-row").count()))
    check("the heading says it was an exam",
          "Exam" in page.locator("#summary-title").inner_text(),
          page.locator("#summary-title").inner_text())
    check("the wording drops 'on the first try', which means nothing here",
          "first try" not in page.locator("#summary-score-tail").inner_text(),
          page.locator("#summary-score-tail").inner_text())

    marks = page.evaluate("""() => [...document.querySelectorAll('.review-row')]
        .map(r => r.className)""")
    rows = record(page)
    check("the marks on screen match what was actually answered",
          all(("is-right" in m) == r["right"] for m, r in zip(marks, rows))
          and all(("is-skipped" in m) == r["skipped"] for m, r in zip(marks, rows)),
          str(marks))
    check("a wrong row shows what he said AND the right answer",
          page.locator(".review-row.is-wrong .review-said").count() >= 1
          and page.locator(".review-row.is-wrong .review-answer").count() >= 1)
    check("a skipped row shows the right answer with no answer of his own",
          "skipped" in page.locator(".review-row.is-skipped .review-said")
          .first.inner_text().lower(),
          page.locator(".review-row.is-skipped .review-said").first.inner_text())

    tally = page.locator(".review-tally").first.inner_text()
    got = sum(1 for r in rows if r["right"])
    check("the per-region tally adds up", tally == f"{got} of 5",
          tally + " vs " + str(got) + " right")
    check("quiz points are still basePoints per right answer",
          page.locator("#summary-points").inner_text() == str(got * FULL),
          page.locator("#summary-points").inner_text())
    check("and still become running seconds",
          page.locator("#summary-seconds").inner_text() == str(got * FULL))
    page.screenshot(path=str(SHOTS / "g8-review.png"), full_page=True)

    # ============ 6. Grading: capitals, and the alternate spellings =======
    start(page, 5, regions=(GREAT_LAKES,))
    # here() rather than reading current.abbr directly: the engine drops
    # `current` to null the moment a round ends, and .abbr off null throws.
    for _ in range(5):
        if here(page)[0] == "MN":
            break
        answer_typed(page)

    check("reached Minnesota", here(page)[0] == "MN", here(page)[0])
    if here(page)[0] == "MN":
        put(page, "St. Paul")
        submit(page)
        check("the alternate spelling St. Paul is accepted in an exam",
              record(page)[-1]["right"] is True, str(record(page)[-1]))

    start(page, 5)
    right_capital = answer(page)
    put(page, right_capital.lower())
    submit(page)
    row = record(page)[-1]
    check("all-lowercase is marked wrong - the same standard as practice",
          row["right"] is False, str(row))
    check("...but flagged as a capital-letter slip, not a spelling one",
          row["capitalOnly"] is True, str(row))

    play_out(page, answer_typed)
    check("the review says so in words",
          page.locator(".review-note").count() >= 1
          and "capital" in page.locator(".review-note").first.inner_text().lower(),
          page.locator(".review-note").first.inner_text()
          if page.locator(".review-note").count() else "no note")
    page.screenshot(path=str(SHOTS / "g8-capitals.png"), full_page=True)

    # Mode 8: an abbreviation is capitals all through, exam or not
    start(page, 8)
    code = answer(page)
    put(page, code.lower())
    submit(page)
    check(f"Mode 8: {code.lower()} is still wrong for {code} in an exam",
          record(page)[-1]["right"] is False, str(record(page)[-1]))
    put(page, answer(page))
    submit(page)
    check("Mode 8: the code in capitals is right",
          record(page)[-1]["right"] is True, str(record(page)[-1]))

    # ============ 7. A picking exam ============
    start(page, 4)
    right = answer(page)
    wrong = page.evaluate("""(r) => [...document.querySelectorAll('.choice-button')]
        .map(b => b.dataset.answer).find(a => a !== r)""", right)

    check("Submit starts refused - nothing has been picked",
          not page.locator("#exam-submit").is_enabled())
    page.locator(f'.choice-button[data-answer="{wrong}"]').click()
    page.wait_for_timeout(200)
    check("picking marks the button as HIS ANSWER",
          page.locator(".choice-button.is-chosen").count() == 1)
    check("and says nothing about whether it is right", marked(page) == 0)
    check("no button is disabled - he can still change his mind",
          page.locator(".choice-button:disabled").count() == 0)

    page.locator(f'.choice-button[data-answer="{right}"]').click()
    page.wait_for_timeout(200)
    check("changing his mind moves the marker, it does not add a second",
          page.locator(".choice-button.is-chosen").count() == 1)
    submit(page)
    check("only the submitted answer counts",
          record(page)[-1]["right"] is True and record(page)[-1]["given"] == right,
          str(record(page)[-1]))
    check("still nothing marked after submitting", marked(page) == 0)

    # ============ 8. A clicking exam ============
    start(page, 10)         # Find the Capital's State
    abbr10, name10 = here(page)
    check("Mode 10 reads out the capital",
          page.locator("#quiz-target").inner_text() == answer(page))
    check("nothing on the map is lit",
          page.locator(".us-map-state.is-highlight").count() == 0)
    check("the state's name is nowhere on screen",
          name10 not in screen_text(page), name10)
    check("no hint here either", page.locator("#quiz-helpers").is_hidden())

    wrong_abbr = other_state(page, abbr10)
    click_state(page, wrong_abbr)
    check("a clicked state is marked as his answer, NOT as wrong",
          "is-chosen" in looks(page, wrong_abbr)
          and "is-wrong" not in looks(page, wrong_abbr),
          looks(page, wrong_abbr))
    page.screenshot(path=str(SHOTS / "g8-map.png"), full_page=True)

    click_state(page, abbr10)
    check("clicking elsewhere moves his answer there",
          "is-chosen" in looks(page, abbr10)
          and "is-chosen" not in looks(page, wrong_abbr),
          looks(page, abbr10) + " | " + looks(page, wrong_abbr))
    submit(page)
    check("the submitted state is what counts",
          record(page)[-1]["right"] is True, str(record(page)[-1]))
    check("the review will name the STATE, not repeat the city",
          record(page)[-1]["correct"] == name10, str(record(page)[-1]))

    play_out(page, answer_click)
    check("a Mode 10 exam ends properly",
          page.locator("#screen-summary.is-active").count() == 1)
    check("the map stops listening",
          page.locator("svg.us-map.is-clickable").count() == 0)

    # ============ 9. The doubled bonus, landing exactly once ============
    page.evaluate("() => Scores.clearScores()")
    start(page, 1, regions=(NEW_ENGLAND, GREAT_LAKES))
    play_out(page, answer_choice)

    quiz_points = int(page.locator("#summary-points").inner_text())
    check("a perfect 2-region exam scores 10 x basePoints",
          quiz_points == 10 * FULL, str(quiz_points))

    page.click("#start-runner-button")
    page.wait_for_timeout(1200)
    page.evaluate("() => Runner.endNow()")
    page.wait_for_timeout(900)

    bonus = int(page.locator("#results-bonus").inner_text())
    coins = int(page.locator("#results-coins").inner_text())
    total = int(page.locator("#results-total").inner_text())
    expected_bonus = 2 * cfg["regionBonusPerRegion"] * cfg["examBonusMultiplier"]

    check("the region bonus is doubled for an exam",
          bonus == expected_bonus, str(bonus) + ", expected " + str(expected_bonus))
    check("and it lands exactly once - the total is the plain sum",
          total == quiz_points + coins + bonus,
          f"quiz {quiz_points} + coins {coins} + bonus {bonus} = {total}")
    page.screenshot(path=str(SHOTS / "g8-results.png"), full_page=True)

    # ============ 10. An exam high score is marked as one ============
    check("the score made the top ten",
          not page.locator("#name-entry").is_hidden())
    page.fill("#name-input", "Examiner")
    page.click("#save-score-button")
    page.wait_for_timeout(400)

    check("the high score row carries an Exam mark",
          page.locator(".scores-table .exam-tag").count() == 1,
          str(page.locator(".scores-table .exam-tag").count()))
    check("the saved entry records it too",
          page.evaluate("() => Scores.loadScores()[0].exam") is True)
    page.screenshot(path=str(SHOTS / "g8-highscore.png"), full_page=True)

    # a practice score alongside it must NOT be marked
    page.click("#play-again-button")
    page.wait_for_timeout(300)
    check("Play Again switches Exam Mode back off",
          not page.evaluate("""() => {
              const t = document.getElementById('exam-toggle');
              return t.checked;
          }"""))

    start(page, 1, exam=False)
    play_out(page, lambda pg: (
        pg.locator(f'.choice-button[data-answer="{answer(pg)}"]').click(),
        pg.wait_for_timeout(1250)))
    page.click("#start-runner-button")
    page.wait_for_timeout(1200)
    page.evaluate("() => Runner.endNow()")
    page.wait_for_timeout(900)
    if not page.locator("#name-entry").is_hidden():
        page.fill("#name-input", "Practiser")
        page.click("#save-score-button")
        page.wait_for_timeout(400)

    check("a practice row is not marked as an exam",
          page.locator(".scores-table .exam-tag").count() == 1,
          str(page.locator(".scores-table .exam-tag").count())
          + " marks for 2 scores, 1 of them an exam")

    # ============ 11. The longest review there can be ============
    # Ten regions is fifty rows. On an ordinary 1366 x 768 laptop that is
    # far more than fits, and the thing that must NOT be pushed off the
    # bottom is the button. This is the trap the click-mode map fell into
    # in Phase 6, and it is worth a standing check rather than a memory.
    small = browser.new_page(viewport={"width": 1366, "height": 768})
    small.on("pageerror", lambda e: problems.append("long review: " + str(e)))

    small.goto(URL + "?debug=1")
    small.wait_for_timeout(300)
    small.click("#start-button")
    small.locator("#mode-list button").nth(0).click()    # Mode 1, quickest
    small.wait_for_timeout(200)
    small.click("#pick-all-button")
    small.locator("#exam-toggle").check()
    small.wait_for_timeout(300)
    small.click("#start-quiz-button")
    small.wait_for_timeout(400)

    asked = 0
    while small.locator("#screen-quiz.is-active").count() == 1 and asked < 60:
        want = small.evaluate(
            "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")
        # Every fourth one wrong on purpose, so the tallies are not all 5s.
        pick = want if asked % 4 != 3 else small.evaluate(
            """(w) => [...document.querySelectorAll('.choice-button')]
                   .map(b => b.dataset.answer).find(a => a !== w)""", want)
        small.locator(f'.choice-button[data-answer="{pick}"]').click()
        small.wait_for_timeout(70)
        small.click("#exam-submit")
        small.wait_for_timeout(110)
        asked += 1

    small.wait_for_timeout(500)
    check("a ten-region exam asks all 50", asked == 50, str(asked))
    check("the review lists all 50", small.locator(".review-row").count() == 50,
          str(small.locator(".review-row").count()))
    check("one heading per region", small.locator(".review-region").count() == 10,
          str(small.locator(".review-region").count()))

    # Every region's tally, summed, must equal the number he got right.
    per_region = small.evaluate("""() =>
        [...document.querySelectorAll('.review-tally')]
            .map(t => parseInt(t.textContent, 10))""")
    right_rows = small.locator(".review-row.is-right").count()
    check("the ten tallies add up to the number actually right",
          sum(per_region) == right_rows,
          str(sum(per_region)) + " tallied vs " + str(right_rows) + " right")
    check("and to the quiz points on the same screen",
          right_rows * FULL == int(small.locator("#summary-points").inner_text()),
          small.locator("#summary-points").inner_text())

    fits = small.evaluate("""() => {
        const b = document.getElementById('start-runner-button')
            .getBoundingClientRect();
        return [Math.round(b.bottom), window.innerHeight];
    }""")
    check("Start Bonus Round is still ON SCREEN with 50 rows above it",
          fits[0] <= fits[1],
          "button bottom " + str(fits[0]) + " vs window " + str(fits[1]))
    check("because the review list scrolls inside itself", small.evaluate("""() => {
        const l = document.getElementById('review-list');
        return l.scrollHeight > l.clientHeight;
    }"""))
    small.screenshot(path=str(SHOTS / "g8-long-review.png"))

    # ============ 12. Practice mode is untouched ============
    page2 = browser.new_page(viewport={"width": 1280, "height": 1100})
    page2.on("pageerror", lambda e: problems.append("practice pageerror: " + str(e)))

    start(page2, 2, exam=False)
    check("Gate 3: Mode 2 still gives away the first letter",
          page2.evaluate("() => Quiz.getState().typed") == answer(page2)[0],
          repr(page2.evaluate("() => Quiz.getState().typed")))
    check("Gate 3: the letter boxes are back",
          page2.locator("#quiz-letters .letter-box").count() > 0)
    check("Gate 3: the backspace ration is back",
          page2.locator("#hud-backspaces").is_visible())
    check("practice: the running score is shown again",
          page2.locator("#hud-points-item").is_visible())
    check("practice: no exam controls anywhere",
          page2.locator("#quiz-exam-actions").is_hidden()
          and page2.locator("#quiz-exam-typing").is_hidden())

    # a wrong letter must still land in red - practice feedback is intact
    page2.keyboard.press("Z" if not answer(page2).upper().startswith("Z") else "Q")
    page2.wait_for_timeout(250)
    check("Gate 3: a wrong letter still lands in red in practice",
          page2.locator(".letter-box.is-wrong").count() == 1)

    start(page2, 4, exam=False)
    page2.wait_for_timeout(700)
    check("Gate 7: the Hint button is back in practice",
          page2.locator("#quiz-hint").is_visible())

    browser.close()

bad = [c for c in console if c.startswith(("error", "warning"))]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 8: ALL CHECKS PASSED" if not problems
                 else "GATE 8: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if problems:
    sys.exit(1)
