"""Gate 5 - the v1.0 ship gate: high scores, sound, art, persistence."""
import sys
from playwright.sync_api import sync_playwright
from pathlib import Path
import shutil

# Where the game is, worked out from where THIS file is, so the
# suite keeps working if the project is moved or cloned somewhere else.
GAME = Path(__file__).resolve().parent.parent / "state-quest"

# Screenshots and browser profiles go in a scratch folder that git
# ignores, rather than littering tests/.
SHOTS = Path(__file__).resolve().parent / "_output"
SHOTS.mkdir(exist_ok=True)
PROFILE = SHOTS / "chrome-profile-gate5"
URL = GAME.joinpath("index.html").as_uri()

problems = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        problems.append(label + " " + detail)


def play_round(page, wrong_on_purpose=0):
    """Play a full Mode 1 round and end the bonus round early."""
    page.click("#start-button")
    page.locator("#mode-list button").nth(0).click()
    page.wait_for_timeout(200)
    page.locator("#region-list input").nth(0).check()
    page.wait_for_timeout(250)
    page.click("#start-quiz-button")
    page.wait_for_timeout(300)

    for q in range(5):
        correct = page.evaluate(
            "() => { const s = Quiz.getState(); return s.current[s.rules.asks]; }")
        if q < wrong_on_purpose:
            # miss it twice so the round scores less
            wrongs = [c for c in page.evaluate(
                "() => [...document.querySelectorAll('.choice-button')]"
                ".map(b => b.dataset.answer)") if c != correct]
            page.locator(f'.choice-button[data-answer="{wrongs[0]}"]').click()
            page.wait_for_timeout(350)
            page.locator(f'.choice-button[data-answer="{wrongs[1]}"]').click()
            page.wait_for_timeout(2400)
        else:
            page.locator(f'.choice-button[data-answer="{correct}"]').click()
            page.wait_for_timeout(1250)

    page.click("#start-runner-button")
    page.wait_for_timeout(900)
    page.click("#finish-runner-button")
    page.wait_for_timeout(1800)


# a clean profile each run, so "first ever score" really is the first
if PROFILE.exists():
    shutil.rmtree(PROFILE, ignore_errors=True)

with sync_playwright() as p:

    # ================= session 1 =================
    ctx = p.chromium.launch_persistent_context(
        str(PROFILE), channel="chrome", viewport={"width": 1280, "height": 1000})
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    console = []
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    page.goto(URL + "?debug=1")
    page.wait_for_timeout(400)

    # ---- the art actually became a WebGL texture ----
    check("the sprite bundle is present",
          page.evaluate("() => typeof SPRITE_ART !== 'undefined' && !!SPRITE_ART"))
    art_count = page.evaluate(
        "() => (typeof SPRITE_ART !== 'undefined' && SPRITE_ART)"
        " ? Object.keys(SPRITE_ART).length : 0")
    check("all eight pictures are in the bundle", art_count == 8, str(art_count))

    page.click("#test-runner-button")
    page.wait_for_timeout(1500)
    tex = page.evaluate(
        "() => Runner.debugTextures ? Runner.debugTextures() : null")
    check("the pictures loaded into the game's drawing engine",
          tex is not None and tex["loaded"] >= 8 and tex["missing"] == [],
          str(tex))
    page.locator("#runner-container").screenshot(path=str(SHOTS / "g5-art.png"))
    page.evaluate("() => Runner.stop()")

    # ---- every sound plays without throwing ----
    names = page.evaluate("() => Sound.names")
    check("all five sounds exist",
          sorted(names) == sorted(["correct", "wrong", "coin",
                                   "roundWin", "highScore"]), str(names))
    threw = page.evaluate("""() => {
        const bad = [];
        Sound.names.forEach(n => { try { Sound.play(n); } catch (e) { bad.push(n); } });
        return bad;
    }""")
    check("every sound plays without an error", threw == [], str(threw))

    # ---- first score: top ten, name box, prefill empty ----
    page.goto(URL + "?debug=1")
    page.wait_for_timeout(400)
    play_round(page)

    check("a first score makes the top ten",
          page.locator("#name-entry").is_visible())
    check("the name box is empty the very first time",
          page.locator("#name-input").input_value() == "",
          repr(page.locator("#name-input").input_value()))

    total1 = int(page.locator("#results-total").inner_text())
    page.fill("#name-input", "Explorer")
    page.click("#save-score-button")
    page.wait_for_timeout(400)

    saved = page.evaluate("() => Scores.loadScores()")
    check("the score was saved with all six columns",
          len(saved) == 1 and all(k in saved[0] for k in
                                  ("name", "score", "mode", "regions", "date")),
          str(saved))
    check("the saved score matches the results screen",
          saved[0]["score"] == total1, f"{saved[0]['score']} vs {total1}")
    check("the name box goes away after saving",
          not page.locator("#name-entry").is_visible())
    check("the new row is highlighted",
          page.locator(".scores-table tr.is-you").count() == 1)
    page.screenshot(path=str(SHOTS / "g5-highscore.png"), full_page=True)

    # ---- a name under 3 letters is refused ----
    page.goto(URL + "?debug=1")
    page.wait_for_timeout(400)
    play_round(page)
    if page.locator("#name-entry").is_visible():
        check("the name box remembers the last name used",
              page.locator("#name-input").input_value() == "Explorer",
              repr(page.locator("#name-input").input_value()))
        page.fill("#name-input", "Pa")
        page.click("#save-score-button")
        page.wait_for_timeout(300)
        check("a name shorter than 3 letters is refused",
              page.locator("#name-entry").is_visible()
              and len(page.evaluate("() => Scores.loadScores()")) == 1)
        page.fill("#name-input", "Pax")
        page.click("#save-score-button")
        page.wait_for_timeout(300)
    check("two scores are now saved",
          len(page.evaluate("() => Scores.loadScores()")) == 2)

    # ---- mute survives, and silences everything ----
    page.click("#mute-button")
    page.wait_for_timeout(200)
    check("mute turns sound off", page.evaluate("() => Sound.isMuted()") is True)

    scores_before = page.evaluate("() => Scores.loadScores()")
    ctx.close()

    # ================= session 2: browser fully closed and reopened ====
    ctx2 = p.chromium.launch_persistent_context(
        str(PROFILE), channel="chrome", viewport={"width": 1280, "height": 1000})
    page2 = ctx2.pages[0] if ctx2.pages else ctx2.new_page()
    page2.on("pageerror", lambda e: problems.append("pageerror(2): " + str(e)))

    page2.goto(URL + "?debug=1")
    page2.wait_for_timeout(500)

    scores_after = page2.evaluate("() => Scores.loadScores()")
    check("HIGH SCORES SURVIVE CLOSING THE BROWSER",
          scores_after == scores_before,
          f"{len(scores_after)} rows after vs {len(scores_before)} before")
    check("mute survives closing the browser",
          page2.evaluate("() => Sound.isMuted()") is True)
    check("the last name used survives closing the browser",
          page2.evaluate("() => Scores.loadLastName()") == "Pax",
          page2.evaluate("() => Scores.loadLastName()"))

    # ---- the list never grows past highScoreCount ----
    cap = page2.evaluate("() => CONFIG.highScoreCount")
    page2.evaluate("""(cap) => {
        for (let i = 0; i < cap + 8; i++) {
            Scores.saveScore({ name: "T" + i, score: i, mode: "State Match",
                               regions: 1, date: "1/1/2026" });
        }
    }""", cap)
    kept = page2.evaluate("() => Scores.loadScores()")
    check("the list never grows past highScoreCount",
          len(kept) == cap, f"{len(kept)} vs cap {cap}")
    check("the list is sorted best first",
          all(kept[i]["score"] >= kept[i + 1]["score"] for i in range(len(kept) - 1)))

    # ---- a score below the tenth gets no name box ----
    page2.evaluate("() => Scores.clearScores()")
    page2.evaluate("""(cap) => {
        for (let i = 0; i < cap; i++) {
            Scores.saveScore({ name: "Ace" + i, score: 9000 + i,
                               mode: "State Match", regions: 1, date: "1/1/2026" });
        }
    }""", cap)
    page2.goto(URL + "?debug=1")
    page2.wait_for_timeout(400)
    play_round(page2)
    check("a score below the tenth does NOT ask for a name",
          not page2.locator("#name-entry").is_visible())
    check("the table is still shown to a player who missed out",
          page2.locator(".scores-table").count() == 1)

    ctx2.close()

    # ================= the no-art fallback =================
    ctx3 = p.chromium.launch(channel="chrome")
    page3 = ctx3.new_page(viewport={"width": 1280, "height": 1000})
    page3.on("pageerror", lambda e: problems.append("pageerror(3): " + str(e)))
    # blank the art bundle before the page scripts run
    page3.add_init_script("window.__killArt = true;")
    page3.goto(URL + "?debug=1")
    page3.evaluate("() => { window.SPRITE_ART = null; }")
    page3.wait_for_timeout(300)
    page3.click("#test-runner-button")
    page3.wait_for_timeout(2500)
    state = page3.evaluate("() => Runner.debugState()")
    check("with no artwork the runner still runs (fallback to boxes)",
          state is not None and state["speed"] > 0, str(state))
    page3.locator("#runner-container").screenshot(path=str(SHOTS / "g5-noart.png"))
    ctx3.close()

bad = [c for c in console if c.startswith(("error", "warning"))]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 5: ALL CHECKS PASSED" if not problems
                 else "GATE 5: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

# Leave a failing exit code behind, so run-all.py's summary line for this
# gate says what actually happened rather than just "it did not crash".
if problems:
    sys.exit(1)
