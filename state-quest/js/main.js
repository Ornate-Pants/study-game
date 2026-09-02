/* ============================================================
   MAIN - The app state machine
   ============================================================

   This file decides WHICH SCREEN the player is looking at.
   The screens are all sitting in index.html at once; exactly
   one of them has the class "is-active" and the rest are
   hidden by the CSS. Changing screens = moving that class.

   The order of screens:
     Title -> Mode Select -> Region Select -> Quiz
           -> Round Summary -> Bonus Runner -> Results
           -> (Play Again goes back to Mode Select)

   PHASE 0: Quiz, Summary, Runner and Results are stubs. They
   show a placeholder message and a button to move forward, so
   the whole loop can be clicked through end to end.
   ============================================================ */

/* ------------------------------------------------------------
   THE 10 MODES

   "status" controls whether a mode can be picked.
     "ready" = playable now
     "soon"  = shown greyed out with a "Coming Soon" label
   To turn a mode on later, change one word. Nothing else.
   ------------------------------------------------------------ */
const MODES = [
  { id: 1,  name: "State Match",                  blurb: "See a state. Pick its name.",            status: "ready" },
  { id: 2,  name: "State Speller",                blurb: "See a state. Spell its name.",           status: "ready" },
  { id: 3,  name: "State Speller: Hard Mode",     blurb: "Spell it with no help at all.",          status: "ready" },
  { id: 4,  name: "Capital Match",                blurb: "See a state. Pick its capital.",         status: "ready" },
  { id: 5,  name: "Capital Speller",              blurb: "See a state. Spell its capital.",        status: "ready" },
  { id: 6,  name: "Capital Speller: Hard Mode",   blurb: "Spell the capital with no help.",        status: "ready" },
  { id: 7,  name: "Abbreviation Match",           blurb: "See a state. Pick its 2 letters.",       status: "ready" },
  { id: 8,  name: "Abbreviation: Hard Mode",      blurb: "Type the 2 letters yourself.",           status: "ready" },
  { id: 9,  name: "Find the State",               blurb: "Read a name. Click it on the map.",      status: "ready" },
  { id: 10, name: "Find the Capital's State",     blurb: "Read a capital. Click its state.",      status: "ready" }
];

const App = (function () {

  // ---- What the player has chosen so far this round ----
  let selectedMode = null;      // a MODES entry
  let selectedRegions = [];     // region numbers, e.g. [1, 4]
  let examMode = false;         // is the next round an exam? (a switch that
                                // works on any of the ten games)
  let quizPoints = 0;           // points from the quiz phase
  let coinPoints = 0;           // points from coins in the runner
  let lastTotal = 0;            // the finished score, for the high score list

  // Where we are, and where we came from (so Back works).
  let currentScreen = null;
  const history = [];

  /* ==========================================================
     SCREEN SWITCHING
     ========================================================== */

  // Show one screen and hide the rest. This is the ONLY place
  // in the whole game that changes which screen is visible.
  function showScreen(name, options) {
    const opts = options || {};
    const target = document.getElementById("screen-" + name);

    if (!target) {
      console.error("[main] No screen called:", name);
      return;
    }

    // Remember where we were so the Back button can return there.
    if (currentScreen && !opts.skipHistory) {
      history.push(currentScreen);
    }

    const screens = document.querySelectorAll(".screen");
    for (let i = 0; i < screens.length; i++) {
      screens[i].classList.remove("is-active");
    }
    target.classList.add("is-active");
    currentScreen = name;

    // Leaving the bonus round always shuts the Phaser game down. It
    // holds the keyboard and keeps drawing otherwise, and Play Again
    // must never end up with two of them running.
    if (name !== "runner") {
      Runner.stop();
    }

    // There is only ONE map and it gets moved from screen to screen,
    // so whichever screen needs it has to ask for it on the way in.
    if (name === "region-select") {
      USMap.mountInto(document.getElementById("region-map-preview"));
      refreshRegionPreview();
    } else if (name === "quiz") {
      USMap.mountInto(document.getElementById("quiz-map"));
    }

    // The Back button only makes sense if there is somewhere to go back to.
    updateBackButton();

    // Move keyboard focus to the new screen's heading so the page
    // reads sensibly and the keyboard doesn't get stranded.
    const heading = target.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }

    if (CONFIG.debug) {
      console.log("[main] screen ->", name);
    }
  }

  // Step back one screen. Does nothing on the title screen.
  function goBack() {
    if (history.length === 0) return;
    const previous = history.pop();
    showScreen(previous, { skipHistory: true });
  }

  // Screens where Back is hidden. Once a round starts it is a
  // commitment: an accidental Back mid-question should not be able
  // to throw away the points earned so far.
  const NO_BACK_SCREENS = ["quiz", "summary", "runner", "results"];

  function updateBackButton() {
    const btn = document.getElementById("back-button");
    if (!btn) return;
    btn.hidden = (history.length === 0)
      || (NO_BACK_SCREENS.indexOf(currentScreen) !== -1);
  }

  // Used by "Play Again": clears the trail so Back doesn't walk
  // backwards through a round that is already finished.
  function resetHistory() {
    history.length = 0;
    updateBackButton();
  }

  /* ==========================================================
     MODE SELECT SCREEN
     ========================================================== */

  function buildModeSelect() {
    const list = document.getElementById("mode-list");
    list.innerHTML = "";

    MODES.forEach(function (mode) {
      // In debug mode every mode is unlocked for testing.
      const playable = (mode.status === "ready") || CONFIG.debug;

      const btn = document.createElement("button");
      btn.className = "mode-button" + (playable ? "" : " is-locked");
      btn.disabled = !playable;
      btn.type = "button";

      // Which mode this button is, so the stylesheet can put the last
      // four somewhere particular. Where things SIT is a layout job and
      // belongs in style.css, the same way colors do - this attribute
      // is only the handle it needs to grab them by.
      btn.dataset.mode = String(mode.id);

      const title = document.createElement("span");
      title.className = "mode-name";
      title.textContent = mode.id + ". " + mode.name;
      btn.appendChild(title);

      const blurb = document.createElement("span");
      blurb.className = "mode-blurb";
      blurb.textContent = mode.blurb;
      btn.appendChild(blurb);

      // Locked modes say so, unless debug unlocked them.
      if (mode.status === "soon") {
        const tag = document.createElement("span");
        tag.className = "mode-tag";
        tag.textContent = CONFIG.debug ? "Unlocked (debug)" : "Coming Soon";
        btn.appendChild(tag);
      }

      if (playable) {
        btn.addEventListener("click", function () {
          selectedMode = mode;
          showScreen("region-select");
        });
      }

      list.appendChild(btn);
    });
  }

  /* ==========================================================
     REGION SELECT SCREEN
     ========================================================== */

  function buildRegionSelect() {
    const list = document.getElementById("region-list");
    list.innerHTML = "";

    // Count how many states are in each region, to show on the label.
    const counts = {};
    QUIZ_DATA.items.forEach(function (item) {
      counts[item.region] = (counts[item.region] || 0) + 1;
    });

    Object.keys(QUIZ_DATA.regions).forEach(function (key) {
      const regionNumber = parseInt(key, 10);

      const label = document.createElement("label");
      label.className = "region-item";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = String(regionNumber);
      box.addEventListener("change", onRegionChange);
      label.appendChild(box);

      // A colored dot in this region's map color. This is the map's
      // key: the dot next to "New England" is the color New England
      // turns on the map when it is picked.
      const swatch = document.createElement("span");
      swatch.className = "region-swatch region-swatch-" + regionNumber;
      swatch.setAttribute("aria-hidden", "true");
      label.appendChild(swatch);

      const text = document.createElement("span");
      text.className = "region-name";
      text.textContent = QUIZ_DATA.regions[key];
      label.appendChild(text);

      const count = document.createElement("span");
      count.className = "region-count";
      count.textContent = (counts[regionNumber] || 0) + " states";
      label.appendChild(count);

      list.appendChild(label);
    });

    onRegionChange();
  }

  // Runs whenever a region box is ticked or unticked.
  function onRegionChange() {
    const boxes = document.querySelectorAll("#region-list input[type=checkbox]");
    selectedRegions = [];
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) {
        selectedRegions.push(parseInt(boxes[i].value, 10));
      }
    }

    // Count the questions the round will have, and show it in plain words.
    const questionCount = QUIZ_DATA.items.filter(function (item) {
      return selectedRegions.indexOf(item.region) !== -1;
    }).length;

    const summary = document.getElementById("region-summary");
    if (selectedRegions.length === 0) {
      summary.textContent = "Pick at least one region to start.";
    } else {
      // An exam doubles the bonus, so the line has to say the number he
      // will actually get - otherwise the results screen is a surprise.
      const bonus = selectedRegions.length * CONFIG.regionBonusPerRegion
        * (examMode ? CONFIG.examBonusMultiplier : 1);

      summary.textContent = questionCount + " questions"
        + "  •  " + bonus + " bonus points at the end"
        + (examMode ? "  •  Exam Mode" : "");
    }

    // Can't start a round with no regions picked.
    document.getElementById("start-quiz-button").disabled =
      (selectedRegions.length === 0);

    refreshRegionPreview();
  }

  // Repaint the map so it shows exactly what is ticked right now.
  // Every picked region gets its own color; everything else goes gray.
  function refreshRegionPreview() {
    USMap.clearAll();

    selectedRegions.forEach(function (regionNumber) {
      const abbrs = QUIZ_DATA.items
        .filter(function (item) { return item.region === regionNumber; })
        .map(function (item) { return item.abbr; });

      USMap.setRegionTint(abbrs, regionNumber);
    });
  }

  function setAllRegions(checked) {
    const boxes = document.querySelectorAll("#region-list input[type=checkbox]");
    for (let i = 0; i < boxes.length; i++) {
      boxes[i].checked = checked;
    }
    onRegionChange();
  }

  /* ==========================================================
     THE ROUND (Phase 0 stubs)
     ========================================================== */

  function startQuiz() {
    quizPoints = 0;
    coinPoints = 0;

    // The quiz screen has to be showing BEFORE the round starts, because
    // the engine immediately draws the first question onto it.
    showScreen("quiz");

    // Hand control to the quiz engine. It runs the whole round and calls
    // finishQuiz() when the last question is done.
    Quiz.start(selectedMode.id, selectedRegions, finishQuiz,
      { exam: examMode });
  }

  // The quiz engine calls this when the round is over.
  function finishQuiz(result) {
    quizPoints = result.points;

    document.getElementById("summary-points").textContent = quizPoints;
    document.getElementById("summary-firsttry").textContent =
      result.firstTryCount + " of " + result.totalCount;
    document.getElementById("summary-seconds").textContent = quizPoints;

    // "on the first try" means nothing in an exam - there is no second
    // try to tell it apart from.
    document.getElementById("summary-title").textContent =
      result.exam ? "Exam Finished" : "Nice Work!";
    document.getElementById("summary-score-tail").textContent =
      result.exam ? "right." : "right on the first try.";

    // The review: the only place an exam marks anything.
    renderReview(result);

    showScreen("summary");
    Sound.play("roundWin");
  }

  /* ==========================================================
     THE EXAM REVIEW

     Every question he answered, grouped under the region it
     came from, with that region's score on the heading. The
     grouping is the point: the per-region tally is what says
     where to focus, and this puts each wrong answer directly
     underneath the heading that counts it.
     ========================================================== */

  function renderReview(result) {
    const panel = document.getElementById("exam-review");
    const list = document.getElementById("review-list");

    panel.hidden = !result.exam;
    list.innerHTML = "";
    if (!result.exam) return;

    // Gather the questions under their region, keeping the order asked
    // inside each one.
    const byRegion = {};
    result.record.forEach(function (item) {
      (byRegion[item.region] = byRegion[item.region] || []).push(item);
    });

    Object.keys(byRegion)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .forEach(function (regionNumber) {
        const rows = byRegion[regionNumber];
        const gotRight = rows.filter(function (r) { return r.right; }).length;

        const group = document.createElement("div");
        group.className = "review-group";

        const heading = document.createElement("h4");
        heading.className = "review-region";

        const swatch = document.createElement("span");
        swatch.className = "region-swatch region-swatch-" + regionNumber;
        swatch.setAttribute("aria-hidden", "true");
        heading.appendChild(swatch);

        const label = document.createElement("span");
        label.textContent = QUIZ_DATA.regions[String(regionNumber)];
        heading.appendChild(label);

        const tally = document.createElement("span");
        tally.className = "review-tally";
        tally.textContent = gotRight + " of " + rows.length;
        heading.appendChild(tally);

        group.appendChild(heading);
        rows.forEach(function (row) {
          group.appendChild(buildReviewRow(row));
        });

        list.appendChild(group);
      });
  }

  // One question on the review screen.
  function buildReviewRow(item) {
    const row = document.createElement("div");
    row.className = "review-row "
      + (item.right ? "is-right" : (item.skipped ? "is-skipped" : "is-wrong"));

    const mark = document.createElement("span");
    mark.className = "review-mark";
    mark.textContent = item.right ? "✓" : (item.skipped ? "–" : "✗");
    row.appendChild(mark);

    const body = document.createElement("span");
    body.className = "review-body";

    const question = document.createElement("span");
    question.className = "review-question";
    question.textContent = item.question;
    body.appendChild(question);

    const said = document.createElement("span");
    said.className = "review-said";
    if (item.skipped) {
      said.textContent = "you skipped this one";
    } else {
      said.textContent = "you said " + item.given;
    }
    body.appendChild(said);

    // The right answer, but only where he did not already write it.
    if (!item.right) {
      const answer = document.createElement("span");
      answer.className = "review-answer";
      answer.textContent = "answer: " + item.correct;
      body.appendChild(answer);
    }

    // Right letters, wrong capitals. Worth saying out loud, or the two
    // words look identical at a glance and the lesson is missed.
    if (item.capitalOnly) {
      const note = document.createElement("span");
      note.className = "review-note";
      note.textContent = "so close - check the capital letters";
      body.appendChild(note);
    }

    row.appendChild(body);
    return row;
  }

  function startRunner() {
    // The timer starts at the quiz points: 1 point = 1 second of
    // running. The runner screen has to be showing BEFORE the game
    // starts, because Phaser measures the box it draws into.
    showScreen("runner");
    Runner.start(quizPoints, finishRunner);
  }

  // The runner calls this when the timer hits 0.
  function finishRunner(result) {
    coinPoints = result.coinPoints;
    showResults();
  }

  function showResults() {
    // The region bonus is added exactly ONCE, right here, after both
    // phases are done. It is never added during the quiz or the runner.
    // An exam doubles it, and that doubling happens here too - in the
    // one place the bonus is worked out, so it can never land twice.
    const regionBonus = selectedRegions.length * CONFIG.regionBonusPerRegion
      * (examMode ? CONFIG.examBonusMultiplier : 1);
    const total = quizPoints + coinPoints + regionBonus;

    document.getElementById("results-quiz").textContent = quizPoints;
    document.getElementById("results-coins").textContent = coinPoints;
    document.getElementById("results-bonus").textContent = regionBonus;
    document.getElementById("results-total").textContent = total;

    if (CONFIG.debug) {
      console.log("[main] results math:", {
        quizPoints: quizPoints,
        coinPoints: coinPoints,
        regions: selectedRegions.length,
        exam: examMode,
        regionBonus: regionBonus,
        total: total
      });
    }

    // Good enough for the top ten? Then ask for a name.
    lastTotal = total;
    const madeIt = Scores.isHighScore(total);

    document.getElementById("name-entry").hidden = !madeIt;
    document.getElementById("save-score-button").disabled = false;

    if (madeIt) {
      const box = document.getElementById("name-input");
      box.value = Scores.loadLastName();     // whoever played last
      Sound.play("highScore");
      throwConfetti();
    }

    renderHighScores(null);
    showScreen("results");

    // Put the cursor in the name box so he can just start typing.
    if (madeIt) {
      document.getElementById("name-input").focus();
    }
  }

  /* ==========================================================
     HIGH SCORES
     ========================================================== */

  // Save the name that was typed, then show the table with that
  // row picked out so he can find himself in it.
  function saveScore() {
    const box = document.getElementById("name-input");
    const name = box.value.trim();

    if (name.length < 3) {
      document.getElementById("name-hint").textContent =
        "Please use at least 3 letters.";
      box.focus();
      return;
    }

    const entry = {
      name: name,
      score: lastTotal,
      mode: selectedMode ? selectedMode.name : "Bonus Round",
      regions: selectedRegions.length,
      // An exam score carries a doubled bonus, so it must never sit in
      // the table looking like an ordinary one. Scores saved before this
      // existed have no such field, which reads as false - so old rows
      // keep working with nothing to convert.
      exam: examMode,
      date: new Date().toLocaleDateString()
    };

    Scores.saveScore(entry);
    Scores.saveLastName(name);

    document.getElementById("name-entry").hidden = true;
    renderHighScores(entry);
  }

  // Draw the top ten. "justAdded" is the row to highlight, or null.
  function renderHighScores(justAdded) {
    const holder = document.getElementById("high-scores");
    const list = Scores.loadScores();

    holder.innerHTML = "";

    const heading = document.createElement("h3");
    heading.className = "scores-title";
    heading.textContent = "Best Scores";
    holder.appendChild(heading);

    if (list.length === 0) {
      const none = document.createElement("p");
      none.className = "lead";
      none.textContent = "No scores yet. Yours could be first!";
      holder.appendChild(none);
      return;
    }

    const table = document.createElement("table");
    table.className = "scores-table";

    const head = document.createElement("tr");
    ["#", "Name", "Score", "Game", "Regions", "Date"].forEach(function (label) {
      const cell = document.createElement("th");
      cell.textContent = label;
      head.appendChild(cell);
    });
    table.appendChild(head);

    list.forEach(function (entry, index) {
      const row = document.createElement("tr");

      // Only one row can be the one just added: same name, same score.
      if (justAdded && entry.name === justAdded.name
          && entry.score === justAdded.score) {
        row.className = "is-you";
      }

      [index + 1, entry.name, entry.score, entry.mode,
       entry.regions, entry.date].forEach(function (value, column) {
        const cell = document.createElement("td");
        cell.textContent = value;

        // The Game column carries the exam marker, so a doubled-bonus
        // score is never silently ranked against an ordinary one.
        if (column === 3 && entry.exam) {
          const tag = document.createElement("span");
          tag.className = "exam-tag";
          tag.textContent = "Exam";
          cell.appendChild(tag);
        }

        row.appendChild(cell);
      });

      table.appendChild(row);
    });

    holder.appendChild(table);
  }

  // A quick burst of coloured squares for a new high score. Pure
  // decoration: it cleans itself up and never blocks anything.
  function throwConfetti() {
    const colors = ["#f0a500", "#2563c9", "#1f9d55", "#d64545", "#a05fa0"];
    const burst = document.createElement("div");
    burst.className = "confetti";

    for (let i = 0; i < 40; i++) {
      const bit = document.createElement("span");
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random() * 0.4) + "s";
      bit.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
      burst.appendChild(bit);
    }

    document.body.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 2600);
  }

  function playAgain() {
    selectedMode = null;
    selectedRegions = [];
    quizPoints = 0;
    coinPoints = 0;
    // Exam Mode is switched off again with the regions. Starting an exam
    // by accident, because the last round happened to be one, is not a
    // mistake worth allowing.
    setExamMode(false);
    setAllRegions(false);
    resetHistory();
    showScreen("mode-select", { skipHistory: true });
  }

  // The one place the exam switch is turned on or off, so the tick box
  // and the flag can never disagree.
  function setExamMode(on) {
    examMode = !!on;
    document.getElementById("exam-toggle").checked = examMode;
    onRegionChange();     // the bonus on the summary line doubles or halves
  }

  /* ==========================================================
     MUTE BUTTON
     ========================================================== */

  function refreshMuteButton() {
    const btn = document.getElementById("mute-button");
    const muted = Sound.isMuted();
    btn.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
    btn.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  /* ==========================================================
     STARTUP
     ========================================================== */

  function init() {
    // ?debug=1 in the web address turns on the testing helpers.
    // Section 13 of the spec: never on by default.
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") {
      CONFIG.debug = true;
      document.getElementById("debug-badge").hidden = false;
      document.body.classList.add("is-debug");
      document.getElementById("test-runner-button").hidden = false;
      document.getElementById("finish-runner-button").hidden = false;
      document.getElementById("clear-scores-button").hidden = false;
    }

    // Which build this is. Read from config so the number is only ever
    // written down in one place.
    document.getElementById("version-tag").textContent =
      "v" + CONFIG.APP_VERSION;

    buildModeSelect();
    buildRegionSelect();
    refreshMuteButton();

    // --- Button wiring ---
    document.getElementById("start-button")
      .addEventListener("click", function () { showScreen("mode-select"); });

    document.getElementById("start-quiz-button")
      .addEventListener("click", startQuiz);

    document.getElementById("pick-all-button")
      .addEventListener("click", function () { setAllRegions(true); });

    document.getElementById("clear-regions-button")
      .addEventListener("click", function () { setAllRegions(false); });

    document.getElementById("exam-toggle")
      .addEventListener("change", function (event) {
        setExamMode(event.target.checked);
      });

    // Testing helper, only visible with ?debug=1.
    document.getElementById("end-round-button")
      .addEventListener("click", function () { Quiz.endRoundNow(); });

    document.getElementById("start-runner-button")
      .addEventListener("click", startRunner);

    // Testing helper, only visible with ?debug=1. Ends the bonus round
    // early but keeps whatever coins were collected.
    document.getElementById("finish-runner-button")
      .addEventListener("click", function () { Runner.endNow(); });

    // Testing helper, only visible with ?debug=1. Jumps straight into
    // the running game with a fixed timer, so it can be tried without
    // playing a quiz first (spec section 12, Gate 4).
    document.getElementById("test-runner-button")
      .addEventListener("click", function () {
        selectedRegions = [];
        quizPoints = 0;
        coinPoints = 0;
        showScreen("runner");
        Runner.start(CONFIG.runnerTestSeconds, finishRunner);
      });

    document.getElementById("play-again-button")
      .addEventListener("click", playAgain);

    document.getElementById("save-score-button")
      .addEventListener("click", saveScore);

    // Pressing Enter in the name box saves, same as clicking.
    document.getElementById("name-input")
      .addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          saveScore();
        }
      });

    // Testing helper, only visible with ?debug=1.
    document.getElementById("clear-scores-button")
      .addEventListener("click", function () {
        Scores.clearScores();
        renderHighScores(null);
      });

    document.getElementById("back-button")
      .addEventListener("click", goBack);

    document.getElementById("mute-button")
      .addEventListener("click", function () {
        Sound.toggleMute();
        refreshMuteButton();
      });

    // Start on the title screen.
    showScreen("title", { skipHistory: true });

    // --- Phase 0 self-check, printed only in debug mode ---
    if (CONFIG.debug) {
      const perRegion = {};
      QUIZ_DATA.items.forEach(function (item) {
        perRegion[item.region] = (perRegion[item.region] || 0) + 1;
      });
      console.log("[check] Phaser loaded:", Runner.isPhaserLoaded(),
        "version:", Runner.getVersion());
      const missingOnMap = QUIZ_DATA.items.filter(function (item) {
        return !USMap.getShape(item.abbr);
      }).map(function (item) { return item.abbr; });
      console.log("[check] map shapes:", USMap.getAbbrs().length,
        "states missing from the map:",
        missingOnMap.length ? missingOnMap : "none");
      console.log("[check] states:", QUIZ_DATA.items.length,
        "regions:", Object.keys(QUIZ_DATA.regions).length,
        "per region:", perRegion);
      console.log("[check] sounds:", Sound.names.join(", "));
      console.log("[check] artwork loaded:",
        (typeof SPRITE_ART !== "undefined" && SPRITE_ART)
          ? Object.keys(SPRITE_ART).length + " pictures"
          : "none - the running game will use plain boxes");
      console.log("[check] saved high scores:", Scores.loadScores().length);
    }
  }

  return {
    init: init,
    showScreen: showScreen
  };

})();

// Wait for the page to finish building before touching any of it.
document.addEventListener("DOMContentLoaded", App.init);
