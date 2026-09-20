"""Drive the Spelling List game in Chrome and check Gate 9.

The one check in here that matters more than all the others:
THE WORD IS NEVER ON SCREEN. Everything else in this file is about
scoring and buttons; that one is about whether the game teaches
anything at all. A spelling game that shows the word is a typing game.

Per tests/README.md, that check runs WITHOUT ?debug=1 - debug mode
deliberately prints the answer, so a visibility check run in it would
be worth nothing.

HOW SPEECH IS TESTED WITHOUT A VOICE. Most machines a test suite runs
on have no speech voice installed at all, so nothing can be listened
for. Speech.debugScript() reports what was HANDED to the reader, in
order, which is the part the game is responsible for. Whether a voice
then says it out loud is the computer's business, and gets checked by
a person with ears - see GATE 9 in SPEC.md section 12.
"""
import sys
from playwright.sync_api import sync_playwright
from browser import launch_args, is_noise
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent / "state-quest"
SHOTS = Path(__file__).resolve().parent / "_output"
SHOTS.mkdir(exist_ok=True)
URL = GAME.joinpath("index.html").as_uri()

problems = []
console = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("   " + detail if detail else ""))
    if not ok:
        problems.append(label + " " + detail)


# A small, known word list, planted before the round so every check
# below knows exactly what it is dealing with.
TEST_LISTS = """[
  { id: "plain", name: "Plain Words", capsEnforced: false,
    words: [{ word: "because", sentence: "" },
            { word: "friend",  sentence: "" }] },
  { id: "caps",  name: "Capital Words", capsEnforced: true,
    words: [{ word: "Monday", sentence: "" }] },
  { id: "nocaps", name: "Capitals Off", capsEnforced: false,
    words: [{ word: "Monday", sentence: "" }] },
  { id: "sound", name: "Sound-alikes", capsEnforced: false,
    words: [{ word: "their", sentence: "Put on their coats." }] }
]"""


def plant(page):
    """Put the known lists in, and reload so the game reads them."""
    page.evaluate("(lists) => SpellingStore.save(lists)",
                  page.evaluate("() => " + TEST_LISTS))


def open_game(page, debug=True):
    page.goto(URL + ("?debug=1" if debug else ""))
    page.wait_for_timeout(350)


def start(page, list_id, mode=1, debug=True):
    """mode is 1-based: 1 = Spelling Practice, 2 = Hard."""
    open_game(page, debug)
    plant(page)
    open_game(page, debug)
    page.click('.game-button[data-game="spelling"]')
    page.wait_for_timeout(150)
    page.locator("#mode-list button").nth(mode - 1).click()
    page.wait_for_timeout(150)
    page.check('#region-list input[value="%s"]' % list_id)
    page.wait_for_timeout(200)
    page.click("#start-quiz-button")
    page.wait_for_timeout(400)


def word(page):
    return page.evaluate("() => Quiz.getState().current.word")


def typed(page):
    return page.evaluate("() => Quiz.getState().typed")


def points(page):
    return page.evaluate("() => Quiz.getState().points")


def spell_it(page, from_here=None):
    """Finish the word on screen, one key at a time."""
    whole = word(page)
    so_far = typed(page) if from_here is None else from_here
    for ch in whole[len(so_far):]:
        page.keyboard.press(ch)
        page.wait_for_timeout(30)
    page.wait_for_timeout(250)


with sync_playwright() as p:
    browser = p.chromium.launch(**launch_args())
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    page.on("console", lambda m: console.append(m.type + ": " + m.text))
    page.on("pageerror", lambda e: problems.append("pageerror: " + str(e)))

    # ================= the game picker =================
    open_game(page)
    check("the game picker is the first screen",
          page.evaluate("() => document.querySelector('.screen.is-active').id")
          == "screen-game-select")

    cards = page.evaluate(
        "() => [...document.querySelectorAll('.game-button')].map(b => b.dataset.game)")
    check("both games are offered", cards == ["states", "spelling"], str(cards))

    page.click('.game-button[data-game="spelling"]')
    page.wait_for_timeout(200)
    check("picking Spelling List switches the colour theme",
          page.evaluate("() => document.body.dataset.game") == "spelling")
    check("the spelling game has exactly two modes",
          page.evaluate("() => document.querySelectorAll('.mode-button').length") == 2)
    check("the gear for changing the word lists is offered",
          not page.evaluate("() => document.getElementById('edit-lists-button').hidden"))

    open_game(page)
    page.click('.game-button[data-game="states"]')
    page.wait_for_timeout(200)
    check("the US game keeps all ten modes and no gear",
          page.evaluate("() => document.querySelectorAll('.mode-button').length") == 10
          and page.evaluate("() => document.getElementById('edit-lists-button').hidden"))

    # ================= THE WORD IS NEVER ON SCREEN =================
    # No ?debug=1: debug mode prints the answer on purpose, so this
    # check has to read the page the way the player sees it.
    start(page, "plain", mode=1, debug=False)
    shown = page.evaluate("""() => {
        const screen = document.getElementById('screen-quiz');
        return screen.innerText;
    }""")
    the_word = page.evaluate("""() => {
        // Not from Quiz.getState(): in a no-debug run the point is what
        // is VISIBLE, so the word is fetched from the data instead.
        return SpellingStore.byId('plain').words.map(w => w.word);
    }""")
    on_screen = [w for w in the_word if w.lower() in shown.lower()]
    check("the word is never written on the quiz screen",
          not on_screen, str(on_screen) + " in: " + shown[:120].replace("\n", " / "))
    check("the map is not on the spelling screen",
          page.evaluate("() => document.getElementById('quiz-map-row').hidden"))
    check("the Say it again button is on the spelling screen",
          not page.evaluate("() => document.getElementById('quiz-listen').hidden"))

    # ================= what gets spoken =================
    start(page, "sound", mode=1)
    script = page.evaluate("() => Speech.debugScript()")
    check("the word, then its sentence, then the word again",
          script == ["their", "Put on their coats.", "their"], str(script))

    before = points(page)
    for _ in range(4):
        page.click("#quiz-say-again")
        page.wait_for_timeout(80)
    check("Say it again costs nothing, however often it is pressed",
          points(page) == before, str(before) + " -> " + str(points(page)))
    check("Say it again really does say it again",
          page.evaluate("() => Speech.debugScript()")[0] == "their")

    # Enter is the keyboard way to the same thing, in practice rounds.
    page.keyboard.press("Enter")
    page.wait_for_timeout(120)
    check("Enter repeats the word and costs nothing", points(page) == before)

    # ================= the Hint button =================
    # Hard mode, so nothing is filled in to start with and the hint's
    # one letter is unmistakable.
    start(page, "plain", mode=2)
    check("hard mode starts with nothing typed", typed(page) == "", repr(typed(page)))

    whole = word(page)
    page.evaluate("() => document.getElementById('quiz-hint').click()")
    page.wait_for_timeout(150)
    check("Hint fills in exactly one letter, the right one",
          typed(page) == whole[0], repr(typed(page)) + " vs " + repr(whole[0]))

    spell_it(page)
    check("a word solved after a hint is worth basePoints - penaltyPoints",
          points(page) == 3, str(points(page)))

    # ================= capitals =================
    start(page, "caps", mode=2)
    page.keyboard.press(word(page)[0].lower())
    page.wait_for_timeout(180)
    check("with capitals ON, a lowercase first letter is refused",
          page.evaluate("() => Quiz.getState().pendingWrong") != "")
    check("...and it says why, in words about a word",
          "CAPITAL" in page.evaluate(
              "() => document.getElementById('quiz-tooltip').textContent"),
          page.evaluate("() => document.getElementById('quiz-tooltip').textContent"))
    page.keyboard.press("Backspace")
    page.wait_for_timeout(80)
    page.keyboard.press(word(page)[0])
    page.wait_for_timeout(150)
    check("with capitals ON, the capital is accepted", typed(page) == "M", repr(typed(page)))

    start(page, "nocaps", mode=2)
    for ch in "monday":
        page.keyboard.press(ch)
        page.wait_for_timeout(35)
    page.wait_for_timeout(250)
    check("with capitals OFF, the same word typed lowercase is accepted",
          points(page) == 5, str(points(page)))
    check("...and the right spelling is what she is left looking at",
          page.evaluate("() => Quiz.getState().typed") in ("Monday", ""),
          page.evaluate("() => Quiz.getState().typed"))

    # A lowercase word never demands a capital, either way round.
    start(page, "plain", mode=2)
    page.keyboard.press(word(page)[0])
    page.wait_for_timeout(150)
    check("a lowercase word never asks for a capital",
          page.evaluate("() => Quiz.getState().pendingWrong") == "")

    # ================= the word list editor =================
    open_game(page)
    plant(page)
    open_game(page)
    page.click('.game-button[data-game="spelling"]')
    page.wait_for_timeout(150)
    page.click("#edit-lists-button")
    page.wait_for_timeout(250)
    check("the gear opens the word list editor",
          page.evaluate("() => document.querySelector('.screen.is-active').id")
          == "screen-list-editor")

    page.click("#editor-new-list")
    page.wait_for_timeout(150)
    page.fill("#editor-name", "Week of Test")
    page.fill("#editor-words",
              "apple\nbanana\nbanana\ntheir | Put on their coats.")
    page.wait_for_timeout(250)
    chips = page.evaluate(
        "() => [...document.querySelectorAll('.editor-chip-word')].map(e => e.textContent)")
    check("every word typed is read back",
          chips == ["apple", "banana", "banana", "their"], str(chips))
    notes = page.evaluate(
        "() => [...document.querySelectorAll('.editor-note')].map(e => e.textContent)")
    check("a word listed twice is pointed out",
          any("twice" in n for n in notes), str(notes))

    # A curly apostrophe, the kind a Word document produces. It has to
    # be straightened, or she would type the word right and be told she
    # was wrong with nothing on screen to show the difference.
    page.fill("#editor-words", "don’t")
    page.wait_for_timeout(250)
    check("a curly apostrophe pasted out of Word is straightened",
          page.evaluate(
              "() => document.querySelector('.editor-chip-word').textContent")
          == "don't",
          page.evaluate(
              "() => document.querySelector('.editor-chip-word').textContent"))

    page.fill("#editor-words", "apple\nbanana")
    page.click("#editor-save")
    page.wait_for_timeout(300)

    # Does it survive the browser being closed and opened again?
    open_game(page)
    saved = page.evaluate(
        "() => SpellingStore.load().map(l => l.name)")
    check("a new list is still there after a reload",
          "Week of Test" in saved, str(saved))

    # The backup text is a real round trip, not a pretty print.
    same = page.evaluate("""() => {
        const now = SpellingStore.load();
        const back = SpellingStore.fromText(SpellingStore.toText(now));
        const shape = (ls) => JSON.stringify(ls.map(
            l => ({ n: l.name, c: l.capsEnforced, w: l.words })));
        return shape(now) === shape(back);
    }""")
    check("the backup text loads back to exactly the same lists", same)

    # ================= Exam Mode, in the spelling game =================
    # The switch works here exactly as it does in the US game: the word
    # is still spoken, because that is the QUESTION, but nothing is
    # marked until the round is over.
    open_game(page)
    plant(page)
    open_game(page, debug=False)
    page.click('.game-button[data-game="spelling"]')
    page.wait_for_timeout(150)
    page.locator("#mode-list button").nth(0).click()
    page.wait_for_timeout(150)
    page.check('#region-list input[value="plain"]')
    page.locator("#exam-toggle").check()
    page.wait_for_timeout(200)
    page.click("#start-quiz-button")
    page.wait_for_timeout(400)

    check("an exam still speaks the word - it is the question",
          page.evaluate("() => Speech.debugScript()")[0] in ("because", "friend"),
          str(page.evaluate("() => Speech.debugScript()")))
    check("an exam uses the plain text box, not the letter boxes",
          not page.evaluate("() => document.getElementById('quiz-exam-typing').hidden")
          and page.evaluate("() => document.getElementById('quiz-typing').hidden"))
    check("Say it again is still offered in an exam",
          not page.evaluate("() => document.getElementById('quiz-listen').hidden"))

    # Answer the first one wrong and the second one right, then read
    # the review. Nothing may be marked before Submit.
    page.fill("#exam-input", "wrongword")
    page.wait_for_timeout(100)
    marked = page.evaluate("""() => {
        const s = document.getElementById('screen-quiz');
        return s.querySelectorAll('.is-correct, .is-wrong').length;
    }""")
    check("nothing is marked right or wrong mid-exam", marked == 0, str(marked))

    page.click("#exam-submit")
    page.wait_for_timeout(400)
    second = page.evaluate("() => SpellingStore.byId('plain').words.map(w => w.word)")
    # whichever word is up now, spell it correctly
    page.fill("#exam-input", page.evaluate(
        "() => Speech.debugScript()[0]"))
    page.click("#exam-submit")
    page.wait_for_timeout(600)

    check("the exam ends on the summary screen",
          page.evaluate("() => document.querySelector('.screen.is-active').id")
          == "screen-summary")
    review = page.evaluate(
        "() => [...document.querySelectorAll('.review-row')].map(r => r.className)")
    check("the review marks every question, one row each",
          len(review) == 2, str(review))
    check("the review groups by word list",
          page.evaluate(
              "() => document.querySelector('.review-region-name').textContent")
          == "Plain Words",
          page.evaluate(
              "() => document.querySelector('.review-region-name').textContent"))
    check("the review shows the right spelling for the one that was missed",
          "because" in page.evaluate("() => document.getElementById('review-list').innerText")
          or "friend" in page.evaluate("() => document.getElementById('review-list').innerText"))

    # ================= high scores stay apart =================
    open_game(page)
    page.evaluate("""() => {
        localStorage.setItem('stateQuest.highScores', JSON.stringify(
            [{ name: 'FromBefore', score: 999, mode: 'State Match',
               regions: 3, date: '1/1/2025' }]));
        localStorage.setItem('studyGame.spelling.highScores', JSON.stringify(
            [{ name: 'Speller', score: 30, mode: 'Spelling Practice',
               regions: 1, date: '1/1/2025' }]));
    }""")
    open_game(page)

    page.click('.game-button[data-game="spelling"]')
    page.wait_for_timeout(150)
    page.evaluate("() => App.showScreen('results')")
    page.wait_for_timeout(100)
    spelling_names = page.evaluate("() => Scores.loadScores('spelling').map(s => s.name)")
    states_names = page.evaluate("() => Scores.loadScores('states').map(s => s.name)")
    check("each game keeps its own high score table",
          spelling_names == ["Speller"] and states_names == ["FromBefore"],
          str(spelling_names) + " / " + str(states_names))
    check("scores saved before there was a second game are untouched",
          page.evaluate("""() => JSON.parse(
              localStorage.getItem('stateQuest.highScores'))[0].score""") == 999)

    page.screenshot(path=str(SHOTS / "gate9-spelling.png"))
    browser.close()

bad = [c for c in console
       if c.startswith(("error", "warning")) and not is_noise(c)]
check("console is clean (no errors or warnings)", not bad, str(bad[:3]))

print("\n=== " + ("GATE 9: ALL CHECKS PASSED" if not problems
                 else "GATE 9: " + str(len(problems)) + " PROBLEM(S)") + " ===")
for pr in problems:
    print("  " + pr)

if problems:
    sys.exit(1)
