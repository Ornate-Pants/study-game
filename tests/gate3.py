"""Drive the typed spelling modes in Chrome and check Gate 3."""
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

problems = []
console = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        problems.append(label + " " + detail)


def start(page, mode, regions=(0,), debug=True):
    """mode is 1-based: 2 = State Speller, 3 = Hard."""
    page.goto(URL + ("?debug=1" if debug else ""))
    page.wait_for_timeout(300)
    page.click("#start-button")
    page.locator("#mode-list button").nth(mode - 1).click()
    page.wait_for_timeout(200)
    for i in regions:
        page.locator("#region-list input").nth(i).check()
    page.wait_for_timeout(250)
    page.click("#start-quiz-button")
    page.wait_for_timeout(350)


def answer(page):
    return page.evaluate(
        "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")


def typed(page):
    return page.evaluate("() => Quiz.getState().typed")


def pending(page):
    return page.evaluate("() => Quiz.getState().pendingWrong")


def boxes(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('.letter-box')].map(b => b.className)")


def hud(page):
    return (int(page.locator("#hud-points").inner_text()),
            page.locator("#hud-progress").inner_text())


def type_rest(page, word=None):
    """Type whatever is still missing from the current answer."""
    word = word or answer(page)
    while True:
        so_far = typed(page)
        # ">=" not "==": dash modes absorb the space between words on
        # their own, so `typed` can run one ahead of the target prefix.
        if len(so_far) >= len(word):
            return
        nxt = word[len(so_far)]
        page.keyboard.press(nxt if nxt != " " else "Space")
        page.wait_for_timeout(45)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    # ============ 1. Mode 2 shows a head start, Mode 3 does not ============
    start(page, 2)
    a = answer(page)
    check("Mode 2 gives away the first letter", typed(page) == a[0],
          repr(typed(page)))
    check("Mode 2 shows one box per letter", len(boxes(page)) == len(a),
          f"{len(boxes(page))} boxes for {a!r}")
    check("Mode 2 fills the space between words for free",
          all("is-space" in boxes(page)[i] for i, c in enumerate(a) if c == " ")
          if " " in a else True, a)
    page.screenshot(path=str(SHOTS / "g3-mode2.png"), full_page=True)

    start(page, 3)
    check("Mode 3 gives no first letter", typed(page) == "", repr(typed(page)))
    check("Mode 3 shows no dashes, so the length stays secret",
          len(boxes(page)) == 0, str(len(boxes(page))))
    check("Mode 3 shows a cursor instead",
          page.locator(".letter-caret").count() == 1)
    page.screenshot(path=str(SHOTS / "g3-mode3.png"), full_page=True)

    # ============ 2. Spelling one correctly ============
    start(page, 2)
    a = answer(page)
    type_rest(page, a)
    page.wait_for_timeout(1300)
    check("spelling a word correctly scores 5", hud(page)[0] == 5, str(hud(page)))
    check("it moves on by itself once the word is done",
          hud(page)[1] == "2 of 5", hud(page)[1])

    # ============ 3. A wrong letter lands, blocks, and backspaces out ======
    start(page, 2)
    a = answer(page)
    before = typed(page)
    wrong = "Z" if not a.upper().startswith("Z") else "Q"

    page.keyboard.press(wrong)
    page.wait_for_timeout(200)
    check("a wrong letter lands in red", pending(page) == wrong, repr(pending(page)))
    check("the wrong letter is shown in a red box",
          any("is-wrong" in c for c in boxes(page)))
    check("the good letters are untouched", typed(page) == before, repr(typed(page)))

    # while it sits there, nothing else goes in
    nxt = a[len(before)]
    page.keyboard.press(nxt)
    page.wait_for_timeout(150)
    check("a pending mistake blocks the next letter",
          typed(page) == before and pending(page) == wrong,
          repr(typed(page)) + " " + repr(pending(page)))
    check("the screen says how to fix it",
          "Backspace" in page.locator("#quiz-typing-hint").inner_text(),
          page.locator("#quiz-typing-hint").inner_text())
    page.screenshot(path=str(SHOTS / "g3-wrong-letter.png"), full_page=True)

    page.keyboard.press("Backspace")
    page.wait_for_timeout(150)
    check("Backspace clears the mistake", pending(page) == "", repr(pending(page)))
    check("a typo costs no points", hud(page)[0] == 0, str(hud(page)))

    type_rest(page, a)
    page.wait_for_timeout(1300)
    check("a word with a typo in it is still worth the full 5",
          hud(page)[0] == 5, str(hud(page)))

    # ============ 4. Capitalization tooltip ============
    # New Hampshire is in New England, so drive the round to it.
    found = False
    for _ in range(12):
        start(page, 2)
        for _q in range(5):
            if answer(page) == "New Hampshire":
                found = True
                break
            type_rest(page)
            page.wait_for_timeout(1250)
        if found:
            break

    check("reached the multi-word state New Hampshire", found)
    if found:
        # type "New" then a lowercase h where a capital belongs
        type_rest(page, "New")
        page.wait_for_timeout(120)
        check("the space between words was filled in automatically",
              typed(page) == "New ", repr(typed(page)))

        page.keyboard.press("h")
        page.wait_for_timeout(250)
        check("a lowercase letter at the start of a word is refused",
              pending(page) == "h", repr(pending(page)))
        check("the capitalization tooltip appears",
              page.locator("#quiz-tooltip").is_visible())
        check("the tooltip says the right thing",
              "capitalize" in page.locator("#quiz-tooltip").inner_text(),
              page.locator("#quiz-tooltip").inner_text())
        page.screenshot(path=str(SHOTS / "g3-tooltip.png"), full_page=True)

        page.keyboard.press("Backspace")
        page.keyboard.press("H")
        page.wait_for_timeout(200)
        check("the same letter capitalized is accepted",
              typed(page) == "New H", repr(typed(page)))

        page.wait_for_timeout(4200)
        check("the tooltip fades away on its own",
              page.locator("#quiz-tooltip").is_hidden())

        # mid-word case does not matter (a stuck Caps Lock is not a crime)
        page.keyboard.press("A")
        page.wait_for_timeout(150)
        check("case is ignored in the middle of a word",
              typed(page) == "New Ha", repr(typed(page)))

    # ============ 4b. Phase 5B: backspaces are rationed ============
    start(page, 2)
    cfg5 = page.evaluate("() => CONFIG")
    lit = lambda: page.evaluate(
        "() => [...document.querySelectorAll('.backspace-mark')]"
        ".filter(m => !m.className.includes('is-spent')).length")

    check("the HUD shows the backspaces left",
          page.locator("#hud-backspaces").is_visible())
    check("he starts with backspacesPerQuestion of them",
          lit() == cfg5["backspacesPerQuestion"], str(lit()))

    stuck = page.evaluate("() => Quiz.getState().current.abbr")
    for i in range(cfg5["backspacesPerQuestion"]):
        page.keyboard.press("Z")
        page.wait_for_timeout(90)
        page.keyboard.press("Backspace")
        page.wait_for_timeout(90)
    check("the arrows count down as they are spent", lit() == 0, str(lit()))
    check("spending them all does not end the question on its own",
          page.evaluate("() => Quiz.getState().current.abbr") == stuck)

    page.keyboard.press("Backspace")
    page.wait_for_timeout(1500)
    check("one more backspace skips the question for him",
          page.evaluate("() => Quiz.getState().current.abbr") != stuck)
    check("a forced skip requeues it like a pressed Skip",
          stuck in page.evaluate("() => Quiz.getState().comeBack"))

    # a wrong letter with none left must also end it, not deadlock
    start(page, 2)
    stuck2 = page.evaluate("() => Quiz.getState().current.abbr")
    for i in range(cfg5["backspacesPerQuestion"]):
        page.keyboard.press("Z")
        page.wait_for_timeout(90)
        page.keyboard.press("Backspace")
        page.wait_for_timeout(90)
    page.keyboard.press("Z")            # a mistake he cannot clear
    page.wait_for_timeout(2200)
    check("a wrong letter with no backspaces left ends the question too",
          page.evaluate("() => Quiz.getState().current.abbr") != stuck2)

    # ============ 5. Skip: fades in, requeues once, then reveals ============
    start(page, 2)
    check("Skip is not there straight away",
          not page.locator("#quiz-skip").is_visible())
    page.wait_for_timeout(5800)
    check("Skip appears after a few seconds",
          page.locator("#quiz-skip").is_visible())

    skipped = page.evaluate("() => Quiz.getState().current.abbr")
    page.click("#quiz-skip")
    page.wait_for_timeout(1300)
    check("a skipped question does not count as finished",
          hud(page)[1] == "1 of 5", hud(page)[1])

    # play out the rest; the skipped one must come back exactly once
    seen = []
    for _ in range(5):
        seen.append(page.evaluate("() => Quiz.getState().current.abbr"))
        if page.evaluate("() => Quiz.getState().current.abbr") == skipped:
            break
        type_rest(page)
        page.wait_for_timeout(1250)

    check("the skipped question comes back later in the round",
          seen[-1] == skipped, str(seen))
    check("the screen says it is a second try",
          "again" in page.locator("#quiz-feedback").inner_text().lower(),
          page.locator("#quiz-feedback").inner_text())

    points_before = hud(page)[0]
    type_rest(page)
    page.wait_for_timeout(1300)
    check("solving it the second time is worth 3, not 5",
          hud(page)[0] - points_before == 3,
          str(hud(page)[0] - points_before))

    # ============ 6. Skipping the same word twice ============
    start(page, 2)
    twice = page.evaluate("() => Quiz.getState().current.abbr")
    twice_name = answer(page)
    page.wait_for_timeout(5800)
    page.click("#quiz-skip")
    page.wait_for_timeout(1300)

    for _ in range(6):
        if page.evaluate("() => Quiz.getState().current.abbr") == twice:
            break
        type_rest(page)
        page.wait_for_timeout(1250)

    page.wait_for_timeout(5800)
    page.click("#quiz-skip")
    page.wait_for_timeout(400)
    check("skipping twice reveals the spelling",
          twice_name in page.locator("#quiz-feedback").inner_text(),
          page.locator("#quiz-feedback").inner_text())
    page.screenshot(path=str(SHOTS / "g3-reveal.png"), full_page=True)

    page.wait_for_timeout(3300)
    rest = []
    while page.locator("#screen-quiz.is-active").count() == 1:
        rest.append(page.evaluate("() => Quiz.getState().current.abbr"))
        type_rest(page)
        page.wait_for_timeout(1250)

    check("a twice-skipped question never comes back a third time",
          twice not in rest, str(rest))
    check("the HUD never overflows past the round size",
          page.locator("#summary-firsttry").inner_text().endswith("of 5"),
          page.locator("#summary-firsttry").inner_text())
    check("a twice-skipped word scores nothing, so 4 of 5 gives 20",
          page.locator("#summary-points").inner_text() == "20",
          page.locator("#summary-points").inner_text())
    check("the summary counts 4 of 5 on the first try",
          page.locator("#summary-firsttry").inner_text() == "4 of 5",
          page.locator("#summary-firsttry").inner_text())

    # ============ 7. Mode 3 needs the space typed ============
    found3 = False
    for _ in range(12):
        start(page, 3)
        for _q in range(5):
            if " " in answer(page):
                found3 = True
                break
            type_rest(page)
            page.wait_for_timeout(1250)
        if found3:
            break

    check("reached a multi-word state in Mode 3", found3)
    if found3:
        word = answer(page)
        head = word.split(" ")[0]
        for ch in head:
            page.keyboard.press(ch)
            page.wait_for_timeout(45)
        check("Mode 3 stops at the space", typed(page) == head, repr(typed(page)))
        page.keyboard.press("Space")
        page.wait_for_timeout(150)
        check("Mode 3 makes him type the space himself",
              typed(page) == head + " ", repr(typed(page)))

    # ============ 8. Gates 1 and 2 still pass ============
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
        page2.locator(f'.choice-button[data-answer="{answer(page2)}"]').click()
        page2.wait_for_timeout(1250)
    check("Gate 2: a perfect Mode 1 round still scores 25",
          page2.locator("#summary-points").inner_text() == "25",
          page2.locator("#summary-points").inner_text())

    browser.close()

bad = [c for c in console if c.startswith(("error", "warning"))]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 3: ALL CHECKS PASSED" if not problems
                 else "GATE 3: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if problems:
    sys.exit(1)
