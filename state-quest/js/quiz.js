/* ============================================================
   QUIZ - The question engine
   ============================================================

   This file runs a whole round: it builds the list of
   questions, asks them one at a time, decides what a pick is
   worth, and hands the total back to main.js at the end.
   main.js only decides WHICH SCREEN is showing; everything
   that happens on the quiz screen happens in here.

   THE SCORING RULES (Section 6 of the spec). All three
   numbers come from data/config.js, none are typed in here:

     right on the 1st pick ....... basePoints                  (5)
     needed a second chance ...... basePoints - penaltyPoints  (3)
     wrong twice ................. 0, and the answer
                                   is shown for a moment

   "Needed a second chance" means the same thing and costs the
   same however it happened: right on the 2nd pick, or skipped
   and then solved when it came back, or (from Phase 7) solved
   after using the Hint button. One penalty, one number.

   A wrong pick NEVER takes points away. There are no lives
   and there is no losing. The worst that happens is a
   question is worth nothing.

   Multiple choice does not ask a missed question again - the
   second pick IS the second chance. (Typed modes in Phase 3
   work differently: those go to the back of the line once.)

   BUILT SO THE OTHER MODES CAN REUSE IT:
   the thing being asked for is a FIELD NAME, never the word
   "name" typed into the logic. Modes 1-3 ask for "name",
   Modes 4-6 for "capital", Modes 7-8 for "abbr", and the
   scoring, the queue and the second-chance rules do not
   change at all.

   THREE WAYS TO ANSWER, one engine behind all of them:
     "choices"   Modes 1, 4, 7      pick one of four buttons
     "typing"    Modes 2, 3, 5, 6, 8  spell it out letter by letter
     "mapClick"  Modes 9, 10        click the state on the map

   All ten modes are built. Every one of them is a line in a
   mode table and nothing else - which is the whole point of
   the table.

   THE ENGINE NO LONGER KNOWS WHAT A STATE IS. There is more
   than one game now, and the mode tables moved out to
   js/games.js along with everything else that is specific to
   a subject: where the questions come from, what tells two of
   them apart, and the part of the screen a question appears
   ON - the map in one game, the voice in another. This file
   asks the GAME for all of that and never names a state, a
   region or a map. Adding a third game should not need this
   file opened at all.

   EXAM MODE (Phase 8) is a SWITCH, not an eleventh mode. It can
   be turned on for any of the ten, and while it is on this file
   behaves almost oppositely:

     no hints, no second chances, nothing requeued,
     no green, no red, no sound, no reveal, no running score
     - he types or picks, presses Submit, and finds out at the
       end on the review screen.

   Everything exam-related lives in the one section headed
   EXAM MODE below. The practice code above it is untouched by
   any of it: the rule is that a practice round runs through
   exactly the same lines it always did.
   ============================================================ */

const Quiz = (function () {

  /* ==========================================================
     WHICH GAME IS BEING PLAYED

     The mode table that used to sit here has moved to
     js/games.js, because there is more than one game now and
     each one has its own. Everything else about a mode works
     exactly as it did: "asks" is still which field of an item
     the player must produce, "answerWith" is still how they
     produce it, and adding a mode is still adding a line to a
     table rather than rewriting anything here.

     "game" is the entry from GAMES that this round belongs to.
     It is where the engine gets its questions, and "stage" is
     the part of the screen the question appears ON - the map
     in one game, the voice in another. Nothing below this line
     knows which.
     ========================================================== */
  let game = null;
  let stage = null;

  // Shown when a letter is right but typed in lowercase where a
  // capital belongs. The US game's wording comes straight from the
  // spec; the spelling game needed its own, because "states or cities"
  // means nothing when the word is "Monday".
  const CAPITAL_TOOLTIP =
    "Remember to capitalize the first letter of states or cities.";

  const WORD_CAPITAL_TOOLTIP =
    "This word starts with a CAPITAL letter. Hold Shift to make one.";

  // Mode 8 only. An abbreviation is capitals the whole way through, so
  // the "first letter of the word" wording above would be misleading.
  const ALLCAPS_TOOLTIP =
    "The 2 letters are BOTH capitals. It is ME, not Me or me.";

  function capitalTooltip() {
    if (state.rules.allCaps) return ALLCAPS_TOOLTIP;
    return game.usesMap ? CAPITAL_TOOLTIP : WORD_CAPITAL_TOOLTIP;
  }

  // Everything about the round in progress lives here.
  let state = {
    modeId: null,      // which mode of this game is being played
    rules: null,       // that mode's line from the game's rules table
    regions: [],       // which groups the player picked (regions, or lists)
    queue: [],         // questions still to be asked
    current: null,     // the state being asked right now
    attempts: 0,       // picks used on the current question (0, 1 or 2)
    isRevisit: false,  // is this the question's second and last appearance?
    comeBack: [],      // codes of states that have already had their one comeback
    points: 0,         // points earned in the quiz phase so far
    resolvedCount: 0,  // how many questions are FINISHED with, for good
    totalCount: 0,     // how many questions the round started with
    firstTryCount: 0,  // how many were solved on their first appearance
    usedHint: false,   // was the Hint button used on THIS question?

    // --- only used while a spelling question is on screen ---
    answers: [],       // every spelling that counts as correct
    typed: "",         // the letters accepted so far
    pendingWrong: "",  // a wrong letter sitting there waiting to be backspaced
    backspacesLeft: 0, // fixes left on this question before it is skipped

    // --- only used while a click-the-map question is on screen ---
    wrongClicks: [],   // states already clicked and already refused

    // --- Exam Mode ---
    exam: false,       // is this round an exam?
    chosen: null,      // his answer so far, NOT yet submitted. An option
                       // string in the picking modes, a state code in the
                       // clicking ones. Typed answers live in the text box.
    record: []         // one entry per question, in the order asked. This
                       // is what the review screen is built from, and it
                       // is the only place the game remembers what he
                       // actually ANSWERED rather than whether he was right.
  };

  // Called when the round is over. main.js supplies it.
  let onRoundEnd = null;

  // Timers waiting to fire. Kept so they can all be cancelled -
  // a timer must never go off on a screen that has moved on.
  let timers = [];

  /* ==========================================================
     SMALL HELPERS
     ========================================================== */

  // Shuffle a list into random order. Standard swap-from-the-end
  // shuffle: walk backwards, swap each item with a random earlier
  // one. Returns a new list; the original is left alone.
  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = out[i];
      out[i] = out[j];
      out[j] = temp;
    }
    return out;
  }

  // Do something after a wait, but in a way that can be called off.
  function later(seconds, action) {
    const id = setTimeout(function () {
      timers = timers.filter(function (t) { return t !== id; });
      action();
    }, seconds * 1000);
    timers.push(id);
  }

  function cancelTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function el(id) {
    return document.getElementById(id);
  }

  // One question's unique id. The US game uses the 2-letter state code
  // for this and the spelling game uses the word itself; the engine only
  // ever needs "the thing that tells two questions apart".
  function keyOf(item) {
    return game.itemKey(item);
  }

  // Ask the question again, without it costing anything. On the map
  // there is nothing to repeat - the state never stopped being lit -
  // but a spoken word has to be said again, and hearing it a second
  // time is the QUESTION being repeated, not help with the answer.
  // So this is free, unlimited, and never touches the score.
  function repeatQuestion() {
    if (!state.current || !stage) return;
    stage.repeat(state.current, state.rules);
  }

  /* ==========================================================
     STARTING A ROUND
     ========================================================== */

  // main.js calls this to hand over control. It gets the round
  // back through whenFinished(), once the last question is done.
  // options.exam turns the whole round into an exam - see the
  // EXAM MODE section further down.
  function start(modeId, regions, whenFinished, options) {
    cancelTimers();

    const exam = !!(options && options.exam);

    // Which game this round belongs to. Defaults to the US game so
    // that an old call with three arguments still works.
    game = (options && options.game) || GAMES.states;
    stage = game.stage;

    const rules = game.rules[modeId];
    if (!rules) {
      console.error("[quiz] mode " + modeId + " is not built in "
        + game.id + ".");
      return null;
    }

    // Every question in the picked groups, in random order.
    const items = game.getItems(regions);

    state = {
      modeId: modeId,
      rules: rules,
      regions: regions.slice(),
      queue: shuffle(items),
      current: null,
      attempts: 0,
      isRevisit: false,
      comeBack: [],
      points: 0,
      resolvedCount: 0,
      questionNumber: 0,
      totalCount: items.length,
      firstTryCount: 0,
      usedHint: false,
      answers: [],
      typed: "",
      pendingWrong: "",
      backspacesLeft: 0,
      wrongClicks: [],
      exam: exam,
      chosen: null,
      record: []
    };

    onRoundEnd = whenFinished;

    // The running score is FEEDBACK - a total that climbs when you get
    // one right tells you that you got it right. So an exam hides it and
    // puts a marker there instead. The number is still kept underneath;
    // it is simply not shown until the round is over.
    el("hud-points-item").hidden = exam;
    el("hud-exam").hidden = !exam;

    // Click-the-map modes get more room for the map, because they have
    // no answer buttons underneath it. A bigger map means Rhode Island
    // is a bigger thing to hit.
    document.body.classList.toggle("is-map-click", isMapClick());

    // Every round starts with the map not listening and the zoom panel
    // away. The click modes switch both on; the others leave them off.
    // (Both are no-ops in a game with no map.)
    stage.setClickable(false);
    stage.hideZoom();

    if (CONFIG.debug) {
      console.log("[quiz] round started:", {
        game: game.id,
        mode: modeId,
        asking_for: rules.asks,
        regions: regions,
        questions: state.totalCount,
        exam: exam
      });
    }

    el("quiz-prompt").textContent = rules.prompt;
    el("end-round-button").hidden = !CONFIG.debug;
    el("quiz-debug-answer").hidden = !CONFIG.debug;

    nextQuestion();
    return state;
  }

  /* ==========================================================
     ASKING A QUESTION
     ========================================================== */

  function nextQuestion() {
    cancelTimers();

    // Out of questions means the round is over.
    if (state.queue.length === 0) {
      finishRound();
      return;
    }

    state.current = state.queue.shift();
    state.attempts = 0;

    // Which question number this is. Held steady for the whole
    // question, so the HUD does not jump ahead during the green flash.
    state.questionNumber = Math.min(state.resolvedCount + 1, state.totalCount);

    // Has this one already been round the block once? If so, this is
    // its last appearance and it is only worth half.
    state.isRevisit =
      state.comeBack.indexOf(keyOf(state.current)) !== -1;

    // Every spelling that counts as right. Nearly always just one,
    // but "Saint Paul" / "St. Paul" is why this is a list.
    const answer = state.current[state.rules.asks];
    state.answers = [answer].concat(game.alternates(state.current));
    state.typed = "";
    state.pendingWrong = "";
    state.backspacesLeft = CONFIG.backspacesPerQuestion;
    state.wrongClicks = [];
    state.usedHint = false;

    updateHud();
    drawBackspaces();
    setupHint();
    clearFeedback();
    hideTooltip();

    // Ask the question, however this game asks one: the US game lights
    // the state up, the spelling game reads the word out loud. EXCEPT in
    // the click modes, where lighting the state up would be handing over
    // the answer - there the map stays blank and the question is written
    // in big letters instead.
    if (isMapClick()) {
      stage.clearAll();
    } else {
      stage.present(state.current, state.rules);
    }

    if (CONFIG.debug) {
      el("quiz-debug-answer").textContent =
        "Debug - the answer is: " + answer + " (" + keyOf(state.current) + ")";
    }

    if (state.isRevisit) {
      say("Let's try this one again!");
    }

    // Show the one answer area this mode uses, and hide the others.
    // A spelling question has TWO of them: the letter boxes for
    // practice, and a plain text box for an exam. Never both.
    const typing = (state.rules.answerWith === "typing");
    const clicking = isMapClick();

    el("quiz-choices").hidden = typing || clicking;
    el("quiz-listen").hidden = !game.stage.speaks;
    el("quiz-map-row").hidden = !game.usesMap;

    // A computer with no voice only gives itself away a moment AFTER
    // being asked to speak, so this asks to be told rather than
    // checking now and believing the answer. The word is never shown
    // instead - that would quietly turn a spelling test into a copying
    // exercise.
    if (game.stage.speaks) {
      el("quiz-no-voice").hidden = Speech.isAvailable();
    }
    el("quiz-typing").hidden = !typing || state.exam;
    el("quiz-exam-typing").hidden = !typing || !state.exam;
    el("quiz-exam-actions").hidden = !state.exam;
    el("quiz-target").hidden = !clicking;

    if (state.exam) {
      askExam();
    } else if (typing) {
      askWithTyping();
    } else if (clicking) {
      askWithMapClick();
    } else {
      askWithChoices();
    }
  }

  // Is the current mode answered by clicking the map? (Modes 9 and 10.)
  function isMapClick() {
    return !!(state.rules && state.rules.answerWith === "mapClick");
  }

  // Modes 1, 4 and 7: four buttons, one right answer. Which field the
  // buttons are filled from is the only difference between the three.
  function askWithChoices() {
    const field = state.rules.asks;
    const correct = state.current[field];
    const options = shuffle(buildChoices().concat([correct]));

    const list = el("quiz-choices");
    list.innerHTML = "";

    options.forEach(function (option, index) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-button";
      btn.dataset.answer = option;

      // The number matches the 1-4 keys, for anyone using the keyboard.
      const key = document.createElement("span");
      key.className = "choice-key";
      key.textContent = String(index + 1);
      btn.appendChild(key);

      const text = document.createElement("span");
      text.className = "choice-text";
      text.textContent = option;
      btn.appendChild(text);

      // The same four buttons serve practice and exams. In practice a
      // click is judged on the spot; in an exam it only SELECTS, and
      // nothing is judged until Submit.
      btn.addEventListener("click", function () {
        if (state.exam) {
          chooseOption(btn, option);
        } else {
          judgePick(btn, option);
        }
      });
      list.appendChild(btn);
    });
  }

  // Pick three wrong answers. States from the SAME region come
  // first on purpose: telling Vermont from New Hampshire is the
  // thing worth learning, so the choices should make you look.
  function buildChoices() {
    const field = state.rules.asks;
    const correct = state.current[field];

    // Anything already used is off the table, so no answer appears twice.
    function usable(pool, taken) {
      return pool.filter(function (item) {
        const value = item[field];
        return value !== correct && taken.indexOf(value) === -1;
      });
    }

    const everything = game.getAllItems();
    const currentGroup = game.itemGroup(state.current);

    const sameRegion = everything.filter(function (item) {
      return game.itemGroup(item) === currentGroup;
    });
    const inPlay = game.getItems(state.regions);

    // Best first, then widen out. The last pool (every question in the
    // game) only matters if the data is ever trimmed very small.
    const pools = [sameRegion, inPlay, everything];
    const picked = [];

    for (let i = 0; i < pools.length && picked.length < 3; i++) {
      const available = shuffle(usable(pools[i], picked));
      for (let j = 0; j < available.length && picked.length < 3; j++) {
        picked.push(available[j][field]);
      }
    }

    return picked;
  }

  /* ==========================================================
     MODES 9 AND 10: FINDING IT ON THE MAP

     Something is READ - a state's name in Mode 9, a capital
     city in Mode 10 - and the answer is given by clicking the
     right shape. Either way the thing clicked is a STATE, so
     both modes are judged on the state's abbr and the code
     below does not know or care which of the two it is
     running. The map is deliberately left blank, because a
     lit-up state would be the answer.

     The two chances work exactly like multiple choice: the
     second click IS the second chance, and a question is never
     asked again. A state that has already been refused turns
     red and stops counting - clicking it again does nothing,
     the same way a wrong choice button switches itself off.
     ========================================================== */

  function askWithMapClick() {
    // The question, in big letters, since the map cannot show it.
    el("quiz-target").textContent = state.current[state.rules.asks];

    // The bigger view of the crowded north-east. Shown before clicking
    // is switched on, so that it goes live along with the big map.
    stage.showZoom(el("quiz-zoom"));

    // Now the map will listen. It is switched off again the moment
    // the round ends, so it never answers questions on other screens.
    stage.setClickable(true, judgeMapClick);
  }

  function judgeMapClick(abbr) {
    // Nothing is being asked right now (mid-flash, or the round is
    // over), so a stray click is just a click.
    if (!state.current || !isMapClick()) return;

    // Already refused once. Not a second strike - a double-click
    // should not be able to use up both chances in one go.
    if (state.wrongClicks.indexOf(abbr) !== -1) return;

    state.attempts++;

    if (abbr === keyOf(state.current)) {
      awardMapClick();
    } else if (state.attempts === 1) {
      state.wrongClicks.push(abbr);
      stage.markWrong(abbr);
      Sound.play("wrong");
      say("Not that one. Try again!");
      logMath(0);
    } else {
      state.wrongClicks.push(abbr);
      stage.markWrong(abbr);
      revealAndRetire();
    }
  }

  // Right state clicked. Same scoring as every other mode.
  function awardMapClick() {
    stage.setClickable(false);
    stage.markCorrect(keyOf(state.current));
    stage.showRing(keyOf(state.current));
    Sound.play("correct");

    const gained = awardPoints();
    say(solvedMessage(gained));

    later(CONFIG.feedbackSeconds, nextQuestion);
  }

  /* ==========================================================
     MODES 2, 3, 5, 6 AND 8: SPELLING IT OUT

     How the typing works:
       - Only the correct next letter moves the word along.
       - A wrong letter LANDS, in red, and blocks everything
         until Backspace takes it away. That is what makes
         Backspace worth having.
       - Getting a letter wrong costs nothing. There is no way
         to fail a word by typing; a word ends either spelled
         or skipped.
       - The first letter of each word must be a capital. That
         is the one place where upper and lower case matter -
         except in Mode 8, where an abbreviation is capitals
         the whole way through.

     TWO SPELLINGS AT ONCE (Phase 7). "Saint Paul" and
     "St. Paul" are both right, and they are not the same
     length. So nothing below ever works from ONE answer: it
     works from every spelling that still matches what has
     been typed, and the field narrows as he types. After "S"
     both an "a" and a "t" are correct next letters; after
     "St" only one spelling is left and the row of dashes
     shortens from 10 boxes to 8 to match.
     ========================================================== */

  function askWithTyping() {
    // Mode 2 gives the first letter away to get him started.
    if (state.rules.showFirstLetter) {
      state.typed = state.answers[0].charAt(0);
      absorbSpaces();
    }

    drawLetters();

    // The Skip button stays out of sight for a few seconds so the
    // word gets a real try before giving up is an option.
    const skip = el("quiz-skip");
    skip.hidden = true;
    skip.classList.remove("is-showing");
    later(CONFIG.skipDelaySeconds, function () {
      skip.hidden = false;
      // A tick later, so the browser notices the change and fades it in.
      later(0.01, function () { skip.classList.add("is-showing"); });
    });
  }

  // Every spelling still in the running: the ones that begin with what
  // has been typed so far. Usually just one. Two, briefly, when a state
  // has an alternate spelling and he has not yet typed the letter that
  // decides between them.
  function liveAnswers() {
    const alive = state.answers.filter(startsWithTyped);
    // Never hand back an empty list. If nothing matches (which the
    // typing rules should make impossible) the first answer is the one
    // the screen falls back to, rather than nothing at all.
    return alive.length ? alive : [state.answers[0]];
  }

  // The spelling being drawn on screen right now: whichever live one
  // comes first. What the dashes are counted from.
  function targetAnswer() {
    return liveAnswers()[0];
  }

  function startsWithTyped(candidate) {
    return candidate.slice(0, state.typed.length) === state.typed;
  }

  // Is the letter at this position the start of a word? Those are
  // the only letters where a capital is required.
  function isWordStart(answer, position) {
    return position === 0 || answer.charAt(position - 1) === " ";
  }

  // Does the letter at this position HAVE to be a capital?
  //
  // Three rules now. First: capitals are only ever required where the
  // answer really does have one sitting there - which is also how the
  // spelling lists say which words need a capital. Type "Monday" into
  // the list and the capital is required; type "because" and it never
  // is. There is nothing else to fill in.
  //
  // Second: a word list can switch capitals off entirely, with the
  // "Capital letters must match" tick box in the word list editor.
  // Then "monday" is accepted, and the screen quietly fills in the
  // capital M so the right spelling is still what she ends up looking
  // at.
  //
  // Third: Mode 8's abbreviations are capitals all the way through,
  // and everywhere else it is the first letter of each word.
  function mustBeCapital(candidates, position, wanted) {
    if (wanted === wanted.toLowerCase()) return false;
    if (game.capsOptional && game.capsOptional(state.current)) return false;
    if (state.rules.allCaps) return true;
    return candidates.some(function (candidate) {
      return isWordStart(candidate, position);
    });
  }

  // Draw the letter boxes. Mode 2 shows a dash for every letter still
  // to come; Mode 3 shows only what has been typed, so the length
  // stays a secret until the word is finished.
  function drawLetters() {
    const answer = targetAnswer();
    const row = el("quiz-letters");
    row.innerHTML = "";

    const slots = state.rules.showDashes ? answer.length : state.typed.length;

    for (let i = 0; i < slots; i++) {
      const box = document.createElement("span");
      box.className = "letter-box";

      if (state.rules.showDashes && answer.charAt(i) === " ") {
        // The gap between words. In dash modes it is filled in for
        // free, so a space is never something to type.
        box.classList.add("is-space");
        box.textContent = " ";
      } else if (i < state.typed.length) {
        box.classList.add("is-filled");
        box.textContent = state.typed.charAt(i);
      } else if (i === state.typed.length && state.pendingWrong) {
        // The mistake sits in the box he is trying to fill, not tacked
        // on the end - that is where his eye already is.
        box.classList.add("is-wrong");
        box.textContent = state.pendingWrong;
      } else {
        box.classList.add("is-blank");
        // A quiet outline on the box he is working on, so there is
        // never any doubt about where the next letter goes.
        if (i === state.typed.length) {
          box.classList.add("is-current");
        }
        box.textContent = "";
      }

      row.appendChild(box);
    }

    // Mode 3 has no boxes waiting, so the mistake (or the cursor) goes
    // on the end - which in that mode IS the current position.
    if (!state.rules.showDashes) {
      const tail = document.createElement("span");
      if (state.pendingWrong) {
        tail.className = "letter-box is-wrong";
        tail.textContent = state.pendingWrong;
      } else {
        tail.className = "letter-caret";
      }
      row.appendChild(tail);
    }

    el("quiz-typing-hint").innerHTML = state.pendingWrong
      ? "Press Backspace to fix it."
      : "&nbsp;";
  }

  // A letter key was pressed while a spelling question is up.
  function typeLetter(letter) {
    // One mistake at a time. Until it is backspaced away, nothing
    // else goes in - but the box wobbles so it is clear why.
    if (state.pendingWrong) {
      shakeLetters();
      return;
    }

    const candidates = liveAnswers();
    const position = state.typed.length;

    // Every letter that would keep at least one spelling alive. Nearly
    // always one letter; two while "Saint Paul" and "St. Paul" are both
    // still possible.
    const wanted = candidates
      .map(function (candidate) { return candidate.charAt(position); })
      .filter(function (character) { return character !== ""; });

    if (wanted.indexOf(letter) !== -1) {
      acceptLetter(letter);
      return;
    }

    // The right letter in the wrong case.
    const sameLetter = wanted.filter(function (character) {
      return character.toLowerCase() === letter.toLowerCase();
    });

    if (sameLetter.length) {
      // Where a capital belongs, this is the whole lesson - so say so
      // instead of just buzzing at him.
      if (mustBeCapital(candidates, position, sameLetter[0])) {
        rejectLetter(letter);
        showTooltip(capitalTooltip());
        return;
      }

      // Anywhere else, case does not matter. A stuck Caps Lock should
      // not punish him for spelling the word correctly.
      acceptLetter(sameLetter[0]);
      return;
    }

    rejectLetter(letter);
  }

  // In dash modes the gap between words is drawn for free, so it is
  // stepped over the moment the letter before it lands. He never types
  // a space in Mode 2. (Mode 3 has no dashes, so he does type it.)
  function absorbSpaces() {
    if (!state.rules.showDashes) return;
    // Only step over a gap that EVERY live spelling agrees is a gap.
    // Otherwise a free space could rule out a spelling he was heading
    // for. (Nothing in the data does this today; it costs nothing to
    // be right about it.)
    while (liveAnswers().every(function (candidate) {
      return candidate.charAt(state.typed.length) === " ";
    })) {
      state.typed += " ";
    }
  }

  function acceptLetter(letter) {
    state.typed += letter;
    absorbSpaces();
    drawLetters();

    // Finished? Only if what is typed matches a whole answer.
    const solved = state.answers.some(function (candidate) {
      return candidate === state.typed;
    });

    if (solved) {
      solveTyped();
    }
  }

  function rejectLetter(letter) {
    state.pendingWrong = letter;
    Sound.play("wrong");
    drawLetters();
    shakeLetters();

    // A wrong letter blocks all further typing until it is backspaced
    // away. With no backspaces left he can never clear it, so end the
    // question here rather than leaving him stuck staring at it.
    if (state.backspacesLeft <= 0) {
      later(0.6, outOfBackspaces);
    }
  }

  // Ran out of backspaces. Treated exactly like pressing Skip, so the
  // scoring and the queue rules do not gain a special case.
  function outOfBackspaces() {
    if (!state.current || state.rules.answerWith !== "typing") return;

    say("Out of backspaces!");
    skipQuestion();
  }

  // Backspace is rationed. Without a limit a word can be cracked by
  // backspacing through the alphabet until the right letter appears,
  // which is exactly what happened the first time this was played.
  function backspace() {
    // Out of backspaces and he still needs one? Then the question is
    // over. Being left with a wrong letter he cannot clear would strand
    // him on a question forever, since a wrong letter blocks typing.
    if (state.backspacesLeft <= 0) {
      outOfBackspaces();
      return;
    }

    state.backspacesLeft--;
    drawBackspaces();

    if (state.pendingWrong) {
      state.pendingWrong = "";
    } else if (state.typed.length > 0) {
      const removed = state.typed.slice(-1);
      state.typed = state.typed.slice(0, -1);

      // If that took away a free space, take the letter before it too.
      // Otherwise the space would just be handed straight back and
      // Backspace would look broken.
      if (removed === " ") {
        state.typed = state.typed.slice(0, -1);
      }

      // Mode 2 always keeps its free first letter.
      if (state.rules.showFirstLetter && state.typed.length === 0) {
        state.typed = targetAnswer().charAt(0);
      }

      absorbSpaces();
    }
    hideTooltip();
    drawLetters();
  }

  function shakeLetters() {
    const row = el("quiz-letters");
    row.classList.remove("is-shaking");
    // Reading offsetWidth forces the browser to notice the class went
    // away, so the same animation can run again on the next mistake.
    void row.offsetWidth;
    row.classList.add("is-shaking");
  }

  // The word is spelled. Score it the same way a right pick is scored.
  function solveTyped() {
    stage.markCorrect(keyOf(state.current));
    Sound.play("correct");
    el("quiz-skip").hidden = true;
    hideTooltip();

    const gained = awardPoints();
    say(solvedMessage(gained));

    later(CONFIG.feedbackSeconds, nextQuestion);
  }

  // The Skip button. First time: the word goes to the back of the
  // line for one more try later. Second time: show it and retire it.
  function skipQuestion() {
    if (state.rules.answerWith !== "typing") return;

    hideTooltip();
    el("quiz-skip").hidden = true;
    hideHintButton();

    if (state.isRevisit) {
      revealAndRetire();
      return;
    }

    state.comeBack.push(keyOf(state.current));
    state.queue.push(state.current);

    say("No problem - this one comes back later.");
    logMath(0);
    later(CONFIG.feedbackSeconds, nextQuestion);
  }

  /* ==========================================================
     EXAM MODE

     One rule runs this whole section: NOTHING ON SCREEN MAY
     SAY WHETHER HE IS RIGHT until the round is over. That is
     more places than it sounds. The colours are the obvious
     one, but the sounds are feedback, the running score is
     feedback, the pause before the next question is there only
     to show a green flash, and the letter-by-letter checking
     built in Phase 3 is feedback in its purest form - a letter
     turning red tells him he is wrong. So in an exam the
     spelling engine is switched off completely and replaced by
     an ordinary text box.

     What is NOT feedback, and must stay: the lit-up state in
     Modes 1-8, and the name or city read out in Modes 9-10.
     Those are the QUESTION. Taking them away would leave
     nothing to answer.

     Answering is in two steps everywhere - put something down,
     then Submit - so he can change his mind, and so all three
     ways of answering end at the same place.
     ========================================================== */

  function askExam() {
    state.chosen = null;
    setSubmitEnabled(false);
    offerExamSkip();

    if (state.rules.answerWith === "typing") {
      const box = el("exam-input");
      box.value = "";
      box.focus();
      return;
    }

    if (isMapClick()) {
      // Same as practice: the map cannot show the question, so it is read.
      el("quiz-target").textContent = state.current[state.rules.asks];
      stage.showZoom(el("quiz-zoom"));
      stage.setClickable(true, chooseState);
      return;
    }

    // The picking modes reuse the practice buttons exactly; only what a
    // click DOES is different, and that is decided in askWithChoices.
    askWithChoices();
  }

  // Picked one of the four buttons. This marks it as HIS ANSWER and says
  // nothing about whether it is right - a different look entirely from
  // the green and red of a practice round.
  function chooseOption(button, option) {
    const buttons = el("quiz-choices").querySelectorAll(".choice-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove("is-chosen");
    }
    button.classList.add("is-chosen");

    state.chosen = option;
    setSubmitEnabled(true);
  }

  // Clicked a state. Only one can be picked at a time, so the map is
  // wiped first - which also takes the last pick off it.
  function chooseState(abbr) {
    if (!state.current || !state.exam) return;

    stage.clearAll();
    stage.markChosen(abbr);

    state.chosen = abbr;
    setSubmitEnabled(true);
  }

  // Typing in the box. The box itself is never checked or corrected;
  // this only decides whether there is anything to submit.
  function onExamTyping() {
    if (!state.current || !state.exam) return;
    setSubmitEnabled(el("exam-input").value.trim() !== "");
  }

  // What he has put down, as words.
  function examAnswer() {
    if (state.rules.answerWith === "typing") {
      return el("exam-input").value.trim();
    }
    if (isMapClick()) {
      // He clicked a shape; the answer he gave is that state's name.
      return state.chosen ? game.labelFor(state.chosen) : "";
    }
    return state.chosen || "";
  }

  // Submit. Marks it in silence, writes it down, and moves straight on -
  // no pause, because the pause in a practice round exists only to hold
  // the green flash, and there is no flash here.
  function submitExam() {
    if (!state.current || !state.exam) return;

    const given = examAnswer();
    if (given === "") return;   // nothing put down; Skip is the way out

    writeDown(given, false);
    nextQuestion();
  }

  // Skip. Allowed in every mode during an exam, because on a picking
  // question it is the honest alternative to a wild guess - and a guess
  // that happens to land would give a false picture. Unlike
  // practice it is final: nothing ever comes back.
  function skipExam() {
    if (!state.current || !state.exam) return;

    writeDown("", true);
    nextQuestion();
  }

  // Mark one question and write down what happened. This is the only
  // place an exam scores anything: full marks or nothing, because there
  // is no second chance to take penaltyPoints off.
  function writeDown(given, skipped) {
    let right = false;
    let capitalOnly = false;

    if (!skipped) {
      if (isMapClick()) {
        // Judged on the state code, exactly as a practice click is.
        right = (state.chosen === keyOf(state.current));
      } else if (state.rules.answerWith === "typing") {
        // Every accepted spelling, capitals and all. Practice REFUSES a
        // lowercase first letter outright, so an exam holding the same
        // line is the same standard, not a harsher one.
        right = state.answers.indexOf(given) !== -1;

        // Same letters, different capitals. On a word list with
        // capitals switched off, practice would have ACCEPTED this, so
        // an exam has to accept it too - the two must never mark the
        // same answer differently.
        const sameLetters = state.answers.some(function (candidate) {
          return candidate.toLowerCase() === given.toLowerCase();
        });

        if (!right && sameLetters
            && game.capsOptional && game.capsOptional(state.current)) {
          right = true;
        }

        // Right letters, wrong capitals, where capitals DO matter.
        // Still wrong - but the review screen says which kind of wrong,
        // so it is a lesson and not a mystery.
        if (!right) {
          capitalOnly = sameLetters;
        }
      } else {
        right = (given === state.current[state.rules.asks]);
      }
    }

    if (right) {
      state.points += CONFIG.basePoints;
      state.firstTryCount++;
    }

    state.record.push({
      key: keyOf(state.current),
      group: game.itemGroup(state.current),
      question: examQuestion(),
      correct: examCorrect(),
      given: skipped ? "" : given,
      skipped: !!skipped,
      right: right,
      capitalOnly: capitalOnly
    });

    retire();
    logMath(right ? CONFIG.basePoints : 0);
  }

  // The question as it appeared on screen, and what a right answer looks
  // like. Both depend on the subject rather than the engine - Modes 1-8
  // lit a state up, Mode 9 read out a name, Mode 10 a city, and the
  // spelling game spoke a word - so each game says it for itself.
  function examQuestion() {
    return game.examQuestionLabel(state.current, state.rules);
  }

  function examCorrect() {
    return game.examCorrectLabel(state.current, state.rules);
  }

  function setSubmitEnabled(on) {
    el("exam-submit").disabled = !on;
  }

  // Skip fades in after a few seconds, the same as it does in practice,
  // so a question gets a real try before giving up is on offer.
  function offerExamSkip() {
    const skip = el("exam-skip");
    skip.hidden = true;
    skip.classList.remove("is-showing");

    // Noted now, checked when the wait is over: answer quickly and this
    // would otherwise appear on the NEXT question, already counted down.
    const askedAt = state.resolvedCount;

    later(CONFIG.skipDelaySeconds, function () {
      if (state.resolvedCount !== askedAt) return;
      skip.hidden = false;
      later(0.01, function () { skip.classList.add("is-showing"); });
    });
  }

  /* ==========================================================
     THE HINT BUTTON (Modes 4, 5, 6 and 8)

     Those four modes light a state up and then ask for
     something that is NOT its name - its capital city, or its
     two letters. So the hint is the state's NAME. It tells him
     where he is standing, not what the answer is.

     It costs the flat penaltyPoints, exactly what a skip or a
     second pick costs, and the three of them never stack: a
     question that needed help of any kind is worth
     basePoints - penaltyPoints and no less. Hinting and then
     getting it on the second pick is still 3, not 1.
     ========================================================== */

  function setupHint() {
    const button = el("quiz-hint");
    const name = el("quiz-hint-name");
    const holder = el("quiz-helpers");

    name.hidden = true;
    name.textContent = "";
    hideHintButton();

    // Only the four modes that ask for something other than the name -
    // and never in an exam, which is the whole point of an exam.
    holder.hidden = !state.rules.hint || state.exam;
    if (!state.rules.hint || state.exam) return;

    // Out of sight for a few seconds first, so the question gets a real
    // try before help is on offer. Same idea as the Skip button.
    //
    // The count of finished questions is noted now and checked when the
    // wait is over: answer this one quickly and the button would
    // otherwise pop up during the green flash, offering help with a
    // question that is already over.
    const askedAt = state.resolvedCount;

    later(CONFIG.hintDelaySeconds, function () {
      if (state.usedHint || state.resolvedCount !== askedAt) return;
      button.hidden = false;
      // A tick later, so the browser notices and fades it in.
      later(0.01, function () { button.classList.add("is-showing"); });
    });
  }

  function hideHintButton() {
    const button = el("quiz-hint");
    button.hidden = true;
    button.classList.remove("is-showing");
  }

  function useHint() {
    // Nothing being asked, no hint in this mode, or already used.
    if (!state.current || !state.rules.hint || state.usedHint) return;

    state.usedHint = true;
    hideHintButton();

    if (state.rules.hintStyle === "nextLetter") {
      // The spelling game. There is no map to name, so the help is one
      // letter of the word - put in through the SAME door a typed letter
      // goes through, so a hint that lands on the last letter finishes
      // the word properly instead of leaving it a letter short.
      const wanted = targetAnswer().charAt(state.typed.length);
      if (wanted) {
        state.pendingWrong = "";     // a hint also clears a stuck mistake
        acceptLetter(wanted);
      }
    } else {
      // The US game: the four modes that light a state up and then ask
      // for something that is NOT its name. The hint says which state.
      const name = el("quiz-hint-name");
      name.textContent = game.hintText(state.current, state.rules);
      name.hidden = false;
    }

    if (CONFIG.debug) {
      console.log("[quiz] hint used on " + keyOf(state.current)
        + " - this question is now worth "
        + Math.max(0, CONFIG.basePoints - CONFIG.penaltyPoints));
    }
  }

  /* ==========================================================
     JUDGING A PICK
     ========================================================== */

  function judgePick(button, picked) {
    const field = state.rules.asks;
    const correct = state.current[field];

    state.attempts++;

    if (picked === correct) {
      award(button);
    } else if (state.attempts === 1) {
      firstMiss(button);
    } else {
      secondMiss(button);
    }
  }

  // Did this question need a second chance? That is the one thing the
  // scoring asks, and it means the same however it happened:
  //   - the Hint button was used                      (Modes 4-6, 8)
  //   - the word was skipped and has come back        (typed modes)
  //   - it took more than one pick or click           (choices, map)
  // They do NOT stack. Any of them, or all of them, costs the same
  // single penaltyPoints - which is what keeps a hinted-then-second-pick
  // answer worth 3 instead of a punishing 1.
  function isSecondChance() {
    if (state.usedHint) return true;

    return (state.rules.answerWith === "typing")
      ? state.isRevisit
      : (state.attempts > 1);
  }

  // What to say when he gets it, worded for how he got there.
  function solvedMessage(gained) {
    if (!isSecondChance()) return "Yes! +" + gained + " points";
    if (state.usedHint) return "Got it with a hint. +" + gained + " points";
    if (state.isRevisit) return "Got it the second time! +" + gained + " points";
    return "Right on the second try. +" + gained + " points";
  }

  // The answer, spelled out after a miss. Which words to use is a
  // question about the subject, not about the engine, so the game says
  // it: in Mode 10 the thing to find is a STATE even though the question
  // was a city, and the two have to be tied back together.
  function answerText() {
    return game.answerText(state.current, state.rules);
  }

  // Add up the points for a solved question. Shared by every mode:
  // full points first time, minus a flat penalty if it took a second
  // chance. The penalty is the same however the second chance came
  // about, so there is only one number to remember.
  function awardPoints() {
    const second = isSecondChance();
    const gained = second
      ? Math.max(0, CONFIG.basePoints - CONFIG.penaltyPoints)
      : CONFIG.basePoints;

    state.points += gained;
    if (!second) {
      state.firstTryCount++;
    }

    retire();
    logMath(gained);
    return gained;
  }

  // This question is finished with, one way or another. Nothing brings
  // it back after this.
  function retire() {
    state.resolvedCount++;
    // Nothing left to hint at. The name it revealed stays up through
    // the flash, because it is part of the answer being shown.
    hideHintButton();
    updateHud();
  }

  // Right answer in a multiple-choice mode.
  function award(button) {
    button.classList.add("is-correct");
    stage.markCorrect(keyOf(state.current));
    Sound.play("correct");
    lockChoices();

    const gained = awardPoints();
    say(solvedMessage(gained));

    later(CONFIG.feedbackSeconds, nextQuestion);
  }

  // First wrong pick: that button goes out, the other three stay live.
  function firstMiss(button) {
    button.classList.add("is-wrong");
    button.disabled = true;
    Sound.play("wrong");
    say("Not that one. Try again!");
    logMath(0);
  }

  // Second wrong pick: show the answer, then move on. No points.
  function secondMiss(button) {
    const correct = state.current[state.rules.asks];

    // Mark the one he just picked, the same as the first wrong pick.
    // Without this the button he clicked last is the only one on
    // screen with nothing to say about itself.
    button.classList.add("is-wrong");

    lockChoices();

    // Turn the right answer green so the eye lands on it.
    const buttons = el("quiz-choices").querySelectorAll(".choice-button");
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i].dataset.answer === correct) {
        buttons[i].classList.add("is-correct");
      }
    }

    revealAndRetire();
  }

  // Out of chances: show the right answer for a moment, score nothing,
  // and never ask this one again. Used by both kinds of mode.
  function revealAndRetire() {
    Sound.play("wrong");
    stage.markCorrect(keyOf(state.current));

    // In the click modes the map was blank, so the green shape is the
    // only thing pointing at the answer. Ring it, or the eye has to
    // hunt for it. Clicking is switched off while it is being shown.
    if (isMapClick()) {
      stage.setClickable(false);
      stage.showRing(keyOf(state.current));
    }

    say("The answer is " + answerText() + ".");

    retire();
    logMath(0);
    later(CONFIG.revealSeconds, nextQuestion);
  }

  // Stop any more picking on this question.
  function lockChoices() {
    const buttons = el("quiz-choices").querySelectorAll(".choice-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
    }
  }

  /* ==========================================================
     THE SCREEN
     ========================================================== */

  // The progress number counts questions FINISHED WITH, not questions
  // shown. A skipped word comes back later, and without this a round
  // of 5 could end up reading "6 of 5".
  function updateHud() {
    el("hud-points").textContent = state.points;
    el("hud-progress").textContent =
      state.questionNumber + " of " + state.totalCount;
  }

  function say(message) {
    el("quiz-feedback").textContent = message;
  }

  // The row of back-arrows in the bar at the top. One arrow per
  // backspace left; a spent one fades to a dot. Only spelling modes
  // have this, so it is hidden everywhere else.
  function drawBackspaces() {
    const holder = el("hud-backspaces");
    if (!holder) return;

    // Never in an exam: backspace is unlimited and free there, because
    // with the letter-by-letter checking off there is nothing left to
    // cheat against. A counter would only be a thing to worry about.
    const typing = state.rules
      && state.rules.answerWith === "typing"
      && !state.exam;

    holder.hidden = !typing;
    if (!typing) return;

    const total = CONFIG.backspacesPerQuestion;
    const left = Math.max(0, state.backspacesLeft);

    holder.innerHTML = "";

    const label = document.createElement("span");
    label.className = "hud-label";
    label.textContent = "Fixes:";
    holder.appendChild(label);

    for (let i = 0; i < total; i++) {
      const mark = document.createElement("span");
      const spent = (i >= left);
      mark.className = "backspace-mark" + (spent ? " is-spent" : "");
      mark.textContent = spent ? "·" : "←";
      holder.appendChild(mark);
    }

    holder.classList.toggle("is-empty", left === 0);
  }

  /* --- The capitalization reminder --- */

  function showTooltip(message) {
    const tip = el("quiz-tooltip");
    tip.textContent = message;
    tip.hidden = false;
    later(CONFIG.tooltipSeconds, hideTooltip);
  }

  function hideTooltip() {
    el("quiz-tooltip").hidden = true;
  }

  function clearFeedback() {
    // A non-breaking space, not an empty string, so the line keeps
    // its height and the buttons below it do not jump up.
    el("quiz-feedback").innerHTML = "&nbsp;";
  }

  // Section 13: in debug mode, print the math for every question so
  // the point totals can be checked by hand against the spec.
  function logMath(gained) {
    if (!CONFIG.debug) return;
    console.log("[quiz] Q" + state.questionNumber + "/" + state.totalCount
      + " " + keyOf(state.current)
      + (state.isRevisit ? " | REVISIT" : " | first look")
      + " | attempt " + state.attempts
      + " | earned " + gained
      + " | running total " + state.points);
  }

  /* ==========================================================
     ENDING THE ROUND
     ========================================================== */

  function finishRound() {
    cancelTimers();

    // Hand the stage back. For the map that means switching clicking off
    // FIRST - there is only one map and it gets moved to other screens,
    // so a listener left on would answer questions nobody is asking. For
    // the spelling game it means stopping the voice mid-word.
    stage.teardown();

    el("quiz-choices").innerHTML = "";
    el("quiz-letters").innerHTML = "";
    el("quiz-skip").hidden = true;
    el("quiz-listen").hidden = true;
    el("quiz-map-row").hidden = false;
    el("quiz-typing").hidden = true;
    el("quiz-target").hidden = true;
    el("quiz-helpers").hidden = true;
    el("quiz-hint-name").hidden = true;
    el("hud-backspaces").hidden = true;
    hideHintButton();

    // The exam bits, and the running score put back for next time.
    el("quiz-exam-typing").hidden = true;
    el("quiz-exam-actions").hidden = true;
    el("exam-input").value = "";
    el("exam-skip").hidden = true;
    el("hud-exam").hidden = true;
    el("hud-points-item").hidden = false;
    document.body.classList.remove("is-map-click");
    hideTooltip();
    clearFeedback();

    // Nothing is being asked any more, so stray keystrokes do nothing.
    state.current = null;

    if (CONFIG.debug) {
      console.log("[quiz] round finished:", {
        game: game.id,
        points: state.points,
        firstTry: state.firstTryCount + " of " + state.totalCount,
        exam: state.exam
      });
    }

    if (onRoundEnd) {
      onRoundEnd({
        points: state.points,
        firstTryCount: state.firstTryCount,
        totalCount: state.totalCount,
        // After an exam this is what the review screen is drawn from.
        // It is empty after a practice round, which never records
        // answers because it marks them as it goes.
        exam: state.exam,
        record: state.record.slice()
      });
    }
  }

  // Debug only: jump straight to the end of the round.
  function endRoundNow() {
    cancelTimers();
    state.queue = [];
    finishRound();
  }

  /* ==========================================================
     KEYBOARD: 1, 2, 3, 4 pick an answer
     ========================================================== */

  function handleKey(event) {
    // Only while the quiz screen is the one showing, and only while a
    // question is actually up.
    const screen = el("screen-quiz");
    if (!screen || !screen.classList.contains("is-active")) return;
    if (!state.rules || !state.current) return;

    // Leave browser shortcuts (Ctrl+R and friends) alone.
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    // EXAM MODE takes a different route entirely. It has to: the
    // practice handler below calls preventDefault() on every printable
    // key, which is right when the letters are being checked one at a
    // time - and fatal in an exam, where the answer goes into an
    // ordinary text box that must be left alone to do its job.
    if (state.exam) {
      handleExamKey(event);
      return;
    }

    if (state.rules.answerWith === "typing") {
      handleTypingKey(event);
    } else if (isMapClick()) {
      // Nothing to type and nothing to number: this mode is answered
      // with the mouse. Keys are left alone on purpose.
      return;
    } else {
      handleChoiceKey(event);
    }
  }

  // In an exam only two things are wired to the keyboard: Enter submits,
  // and on a picking question 1-4 still choose a button. Every other key
  // is left alone so the text box can have it.
  function handleExamKey(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitExam();
      return;
    }

    if (state.rules.answerWith !== "choices") return;
    handleChoiceKey(event);
  }

  // Modes 1, 4, 7: the number keys pick an answer.
  function handleChoiceKey(event) {
    const slot = parseInt(event.key, 10);
    if (!(slot >= 1 && slot <= 4)) return;

    const buttons = el("quiz-choices").querySelectorAll(".choice-button");
    const button = buttons[slot - 1];
    if (button && !button.disabled) {
      button.click();
    }
  }

  // Modes 2, 3: spell it out.
  function handleTypingKey(event) {
    if (event.key === "Backspace") {
      event.preventDefault();   // stop the browser going back a page
      backspace();
      return;
    }

    // Enter says the word again, in the spelling game. It can be
    // spared: every PRINTABLE key is taken by the spelling itself, and
    // Enter does nothing at all in a practice round. (In an exam it
    // already means Submit, so there the button is the only way.)
    if (event.key === "Enter") {
      event.preventDefault();
      repeatQuestion();
      return;
    }

    // One printable character: a letter, or the space between words.
    if (event.key.length === 1) {
      event.preventDefault();
      typeLetter(event.key);
    }
  }

  document.addEventListener("keydown", handleKey);
  document.getElementById("quiz-skip")
    .addEventListener("click", skipQuestion);
  document.getElementById("quiz-hint")
    .addEventListener("click", useHint);
  document.getElementById("quiz-say-again")
    .addEventListener("click", function () {
      // Hand the keyboard back to the spelling. Left focused, this
      // button would answer Enter itself as well as through the key
      // handler, and say the word twice over.
      this.blur();
      repeatQuestion();
    });

  // If it turns out this computer cannot speak, say so on the quiz
  // screen the moment we find out - which may be mid-question, after
  // the screen has already been drawn. Written to cope with being told
  // either way round, because a voice can also turn up late.
  Speech.whenChanged(function () {
    document.getElementById("quiz-no-voice").hidden = Speech.isAvailable();
  });

  // --- Exam Mode wiring ---
  document.getElementById("exam-submit")
    .addEventListener("click", submitExam);
  document.getElementById("exam-skip")
    .addEventListener("click", skipExam);
  document.getElementById("exam-input")
    .addEventListener("input", onExamTyping);

  // Read-only peek at the round state, used by the HUD and by tests.
  function getState() {
    return state;
  }

  return {
    start: start,
    getState: getState,
    repeatQuestion: repeatQuestion,
    endRoundNow: endRoundNow,
    cancelTimers: cancelTimers
  };

})();
