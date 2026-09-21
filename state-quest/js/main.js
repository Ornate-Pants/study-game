/* ============================================================
   MAIN - The app state machine
   ============================================================

   This file decides WHICH SCREEN the player is looking at.
   The screens are all sitting in index.html at once; exactly
   one of them has the class "is-active" and the rest are
   hidden by the CSS. Changing screens = moving that class.

   The order of screens:
     Game Select -> Mode Select -> Group Select -> Quiz
                 -> Round Summary -> Bonus Runner -> Results
                 -> (Play Again goes back to Mode Select)

   The gear on Mode Select opens the word list editor, which
   is a side road off that screen rather than part of the run.

   THE SAME SCREENS SERVE EVERY GAME. There is more than one
   now, and which one is being played lives in "activeGame" -
   an entry from GAMES in js/games.js. Every place this file
   would otherwise have said "state" or "region", it asks the
   active game instead: what its groups are called, what its
   modes are, which colours to wear, which high score table is
   its own. Adding a third game is an entry in that file.
   ============================================================ */

const App = (function () {

  // ---- What the player has chosen so far this round ----
  let activeGame = null;        // a GAMES entry: which game is being played
  let selectedMode = null;      // one of that game's modes
  let selectedRegions = [];     // groups picked: region numbers, or list ids
  let examMode = false;         // is the next round an exam? (a switch that
                                // works on any mode of either game)
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

    // There is only ONE map and it gets moved from screen to screen, so
    // whichever screen needs it has to ask for it on the way in. A game
    // with no map does nothing here; that is why it goes through the
    // game's stage rather than talking to USMap directly.
    if (name === "region-select") {
      // The map is ONE element that gets moved from screen to screen,
      // so a game with no map does not simply leave it alone - it has
      // to put the frame away, or the last game's map is still sitting
      // there under the word lists.
      const preview = document.getElementById("region-map-preview");
      preview.hidden = !activeGame.usesMap;
      activeGame.stage.mountInto(preview);
      refreshRegionPreview();
    } else if (name === "quiz") {
      activeGame.stage.mountInto(document.getElementById("quiz-map"));
    } else if (name === "game-select") {
      // Rebuilt on the way in, not once at startup. Whether the
      // spelling game can be played depends on there being a voice on
      // this computer, and that is only ever found out for certain by
      // trying - so a card that was offered before may not be now.
      buildGameSelect();
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

  // Step back one screen. Does nothing on the first screen.
  function goBack() {
    if (history.length === 0) return;

    // Leaving the word list editor saves, exactly as its Done button
    // does. Somebody who has just typed in twelve words and reached for
    // the Back arrow should not lose them, and "which button saves?"
    // is not a thing anyone should have to know.
    if (currentScreen === "list-editor") {
      ListEditor.close();
      buildRegionSelect();
      setAllRegions(false);
    }

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

  // Used by "Play Again": throws away the trail through the round that
  // just finished, so Back can never step into the old quiz, summary,
  // runner or results screen. It does not leave Back with nowhere to
  // go, though - it reseeds the trail with "game-select", exactly what
  // history would hold the first time mode-select is ever shown. Back
  // from mode-select should behave the same whichever way you arrived.
  function resetHistory() {
    history.length = 0;
    history.push("game-select");
    updateBackButton();
  }

  /* ==========================================================
     MODE SELECT SCREEN
     ========================================================== */

  function buildModeSelect() {
    const list = document.getElementById("mode-list");
    list.innerHTML = "";

    activeGame.modes.forEach(function (mode) {
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

  // The "pick what to practice" screen. The US game groups states into
  // REGIONS and the spelling game groups words into weekly LISTS, but a
  // tick box is a tick box, so one screen serves both and the game says
  // what to call things.
  function buildRegionSelect() {
    const list = document.getElementById("region-list");
    const groups = activeGame.getGroups();
    list.innerHTML = "";

    // Count how many questions are in each group, to show on the label.
    const counts = {};
    activeGame.getAllItems().forEach(function (item) {
      const key = activeGame.itemGroup(item);
      counts[key] = (counts[key] || 0) + 1;
    });

    document.getElementById("region-heading").textContent =
      activeGame.groupHeading;
    document.getElementById("region-lead").textContent =
      activeGame.groupLead;

    Object.keys(groups).forEach(function (key, index) {
      const groupId = activeGame.groupIdFromKey(key);

      const label = document.createElement("label");
      label.className = "region-item";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = String(key);
      box.addEventListener("change", onRegionChange);
      label.appendChild(box);

      // A colored dot. In the US game it is the map's key: the dot next
      // to "New England" is the color New England turns on the map when
      // it is picked. The spelling game has no map, so its dots are just
      // a way of telling one list from another - which is why they are
      // handed out by position and wrap round after ten.
      const swatch = document.createElement("span");
      swatch.className = "region-swatch region-swatch-"
        + activeGame.swatchFor(key, index);
      swatch.setAttribute("aria-hidden", "true");
      label.appendChild(swatch);

      const text = document.createElement("span");
      text.className = "region-name";
      text.textContent = groups[key];
      label.appendChild(text);

      const count = document.createElement("span");
      count.className = "region-count";
      count.textContent = (counts[groupId] || 0) + " " + activeGame.itemWord;
      label.appendChild(count);

      list.appendChild(label);
    });

    onRegionChange();
  }

  // Runs whenever a group box is ticked or unticked.
  function onRegionChange() {
    const boxes = document.querySelectorAll("#region-list input[type=checkbox]");
    selectedRegions = [];
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) {
        selectedRegions.push(activeGame.groupIdFromKey(boxes[i].value));
      }
    }

    // Count the questions the round will have, and show it in plain words.
    const questionCount = activeGame.getItems(selectedRegions).length;

    const summary = document.getElementById("region-summary");
    if (selectedRegions.length === 0) {
      summary.textContent =
        "Pick at least one " + activeGame.groupLabelOne + " to start.";
    } else {
      // An exam doubles the bonus, so the line has to say the number he
      // will actually get - otherwise the results screen is a surprise.
      const bonus = selectedRegions.length * CONFIG.regionBonusPerRegion
        * (examMode ? CONFIG.examBonusMultiplier : 1);

      summary.textContent = questionCount + " " + activeGame.itemWord
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
  // Only the US game has a map; for the others this does nothing.
  function refreshRegionPreview() {
    if (!activeGame.usesMap) return;

    USMap.clearAll();

    selectedRegions.forEach(function (regionNumber) {
      const abbrs = activeGame.getItems([regionNumber])
        .map(function (item) { return activeGame.itemKey(item); });

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
      { exam: examMode, game: activeGame });
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

    // Gather the questions under the group they came from - a region in
    // the US game, a word list in the spelling one - keeping the order
    // asked inside each one. The per-group tally is the point of the
    // whole screen: it is what says where to focus next.
    const groups = activeGame.getGroups();
    const byRegion = {};
    const order = [];
    result.record.forEach(function (item) {
      if (!byRegion[item.group]) {
        byRegion[item.group] = [];
        order.push(item.group);
      }
      byRegion[item.group].push(item);
    });

    // Groups come out in the order the game lists them, not the order
    // they happened to be asked in, so the screen reads the same way the
    // tick-box screen did.
    const listed = Object.keys(groups).map(activeGame.groupIdFromKey);
    order.sort(function (a, b) {
      return listed.indexOf(a) - listed.indexOf(b);
    });

    order.forEach(function (groupId) {
        const rows = byRegion[groupId];
        const gotRight = rows.filter(function (r) { return r.right; }).length;

        const group = document.createElement("div");
        group.className = "review-group";

        const heading = document.createElement("h4");
        heading.className = "review-region";

        const swatch = document.createElement("span");
        swatch.className = "region-swatch region-swatch-"
          + activeGame.swatchFor(groupId, listed.indexOf(groupId));
        swatch.setAttribute("aria-hidden", "true");
        heading.appendChild(swatch);

        const label = document.createElement("span");
        label.className = "review-region-name";
        label.textContent = groups[String(groupId)] || String(groupId);
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
    document.getElementById("results-bonus-label").textContent =
      activeGame.bonusLabel;
    document.getElementById("results-total").textContent = total;

    if (CONFIG.debug) {
      console.log("[main] results math:", {
        game: activeGame.id,
        quizPoints: quizPoints,
        coinPoints: coinPoints,
        regions: selectedRegions.length,
        exam: examMode,
        regionBonus: regionBonus,
        total: total
      });
    }

    // Good enough for the top ten? Then ask for a name. Each game keeps
    // its own table, so a spelling score is never ranked against a
    // states one - they are not the same thing and never were.
    lastTotal = total;
    const madeIt = Scores.isHighScore(activeGame.id, total);

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

    Scores.saveScore(activeGame.id, entry);
    Scores.saveLastName(name);

    document.getElementById("name-entry").hidden = true;
    renderHighScores(entry);
  }

  // Draw the top ten. "justAdded" is the row to highlight, or null.
  function renderHighScores(justAdded) {
    const holder = document.getElementById("high-scores");
    const list = Scores.loadScores(activeGame.id);

    holder.innerHTML = "";

    const heading = document.createElement("h3");
    heading.className = "scores-title";
    heading.textContent = "Best Scores - " + activeGame.name;
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

    // The fifth column is "Regions" in the US game and "Lists" in the
    // spelling one: the same number, counting different things.
    const columns = ["#", "Name", "Score", "Game",
                     activeGame.scoreColumn, "Date"];

    const head = document.createElement("tr");
    columns.forEach(function (label) {
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

  // Back to the mode list of the game just played, not to the game
  // picker: wanting another go at the same game is much the commoner
  // thing, and the picker is one Back away if it isn't.
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
     THE GAME PICKER

     The first thing on screen. Each game is a card in its own
     colours, so which one you are in is never a guess.
     ========================================================== */

  function buildGameSelect() {
    const list = document.getElementById("game-list");
    list.innerHTML = "";

    GAMES.all.forEach(function (entry) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "game-button";
      card.dataset.game = entry.id;

      const title = document.createElement("span");
      title.className = "game-name";
      title.textContent = entry.name;
      card.appendChild(title);

      const blurb = document.createElement("span");
      blurb.className = "game-blurb";
      blurb.textContent = entry.blurb;
      card.appendChild(blurb);

      // A game can say it cannot be played on this computer. The
      // spelling game does exactly that when there is no voice
      // installed: it needs to read words out loud, and saying so
      // plainly beats letting her open a game that will sit silent.
      const trouble = entry.unavailableReason && entry.unavailableReason();
      if (trouble) {
        card.classList.add("is-locked");
        card.disabled = true;

        const tag = document.createElement("span");
        tag.className = "game-tag";
        tag.textContent = trouble;
        card.appendChild(tag);
      } else {
        card.addEventListener("click", function () { chooseGame(entry); });
      }

      list.appendChild(card);
    });
  }

  // The one place a game is switched. Everything that depends on WHICH
  // game is being played is rebuilt here, so the two can never get out
  // of step with each other.
  function chooseGame(entry) {
    activeGame = entry;

    // The colour theme. Every colour in the stylesheet comes from a
    // variable, and this one attribute is what swaps the whole set.
    document.body.dataset.game = entry.id;

    selectedMode = null;
    selectedRegions = [];

    // The mode cards and the tick boxes are rebuilt BEFORE the exam
    // switch is touched, because turning that switch recounts the
    // questions in the ticked groups - and until the boxes have been
    // rebuilt those are still the other game's.
    buildModeSelect();
    buildRegionSelect();
    setAllRegions(false);
    setExamMode(false);

    // The mode screen names the game, so which one she is in is never
    // in doubt once the picker is behind her.
    document.getElementById("mode-heading").textContent = entry.name;

    // Only the spelling game has a word list to edit.
    document.getElementById("edit-lists-button").hidden = !entry.editableLists;

    showScreen("mode-select");
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

    // Start out in the US game so that everything has a game to read
    // from before one has been picked. The picker replaces it the
    // moment a card is clicked.
    activeGame = GAMES.states;
    document.body.dataset.game = activeGame.id;

    buildGameSelect();
    buildModeSelect();
    buildRegionSelect();
    refreshMuteButton();

    // If it turns out this computer has no voice, the spelling card
    // has to stop offering a game that cannot be played. We only find
    // that out by trying, so the picker is told rather than asked.
    Speech.whenChanged(buildGameSelect);

    // --- Button wiring ---

    // The gear on the Pick a Game screen. Spelling only.
    document.getElementById("edit-lists-button")
      .addEventListener("click", function () {
        ListEditor.open();
        showScreen("list-editor");
      });

    // Done saves on the way out, so the last thing typed is never
    // quietly lost, and then rebuilds the tick-box screen - the lists
    // on it have just changed.
    // Done is Back with a clearer label. goBack() does the saving and
    // the rebuilding, so both routes out behave identically.
    document.getElementById("editor-done")
      .addEventListener("click", goBack);

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
        Scores.clearScores(activeGame.id);
        renderHighScores(null);
      });

    document.getElementById("back-button")
      .addEventListener("click", goBack);

    document.getElementById("mute-button")
      .addEventListener("click", function () {
        Sound.toggleMute();
        refreshMuteButton();
      });

    // Start on the game picker. It is the first thing on screen because
    // there is more than one game now, and which one you are playing has
    // to be the first thing decided.
    showScreen("game-select", { skipHistory: true });

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
      console.log("[check] games:",
        GAMES.all.map(function (g) { return g.id; }).join(", "));
      console.log("[check] speech:", Speech.describe());
      console.log("[check] artwork loaded:",
        (typeof SPRITE_ART !== "undefined" && SPRITE_ART)
          ? Object.keys(SPRITE_ART).length + " pictures"
          : "none - the running game will use plain boxes");
      console.log("[check] saved high scores:",
        GAMES.all.map(function (g) {
          return g.id + "=" + Scores.loadScores(g.id).length;
        }).join(" "));
    }
  }

  return {
    init: init,
    showScreen: showScreen
  };

})();

// Wait for the page to finish building before touching any of it.
document.addEventListener("DOMContentLoaded", App.init);
