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
   "name" typed into the logic. Mode 1 asks for "name",
   Mode 4 will ask for "capital", Mode 7 for "abbr", and the
   scoring, the queue and the second-chance rules do not
   change at all.

   THREE WAYS TO ANSWER, one engine behind all of them:
     "choices"   Mode 1        pick one of four buttons
     "typing"    Modes 2, 3    spell it out letter by letter
     "mapClick"  Mode 9        click the state on the map

   Still to come:
     Phase 7  Modes 4-8 and 10 (capitals and abbreviations)
   ============================================================ */

const Quiz = (function () {

  /* ==========================================================
     WHAT EACH MODE ASKS FOR

     "asks" is which field of a state the player must produce.
     "answerWith" is how they produce it.
     Adding a mode later means adding a line here, not
     rewriting the engine.
     ========================================================== */
  const MODE_RULES = {
    1: {
      asks: "name",
      answerWith: "choices",
      prompt: "Which state is lit up?"
    },
    2: {
      asks: "name",
      answerWith: "typing",
      showFirstLetter: true,    // the word starts with its first letter filled in
      showDashes: true,         // and a dash for every letter still to come
      prompt: "Spell the state that is lit up."
    },
    3: {
      asks: "name",
      answerWith: "typing",
      showFirstLetter: false,   // no head start
      showDashes: false,        // and no clue how long the word is
      prompt: "Spell the state that is lit up. No hints this time!"
    },
    9: {
      asks: "name",
      answerWith: "mapClick",
      // The map is the ANSWER SHEET in this mode, so it must not light
      // anything up. The question is read instead, in big letters.
      showsTargetText: true,
      prompt: "Find this state on the map."
    }
    // Phase 7 adds:  4 to 8, and 10 (the same mapClick as above, but
    //                asking for "capital" instead of "name")
  };

  // Shown when a letter is right but typed in lowercase where a
  // capital belongs. Wording comes straight from the spec.
  const CAPITAL_TOOLTIP =
    "Remember to capitalize the first letter of states or cities.";

  // Everything about the round in progress lives here.
  let state = {
    modeId: null,      // which of the 10 modes is being played
    rules: null,       // that mode's line from MODE_RULES above
    regions: [],       // which region numbers the player picked
    queue: [],         // states still to be asked
    current: null,     // the state being asked right now
    attempts: 0,       // picks used on the current question (0, 1 or 2)
    isRevisit: false,  // is this the question's second and last appearance?
    comeBack: [],      // codes of states that have already had their one comeback
    points: 0,         // points earned in the quiz phase so far
    resolvedCount: 0,  // how many questions are FINISHED with, for good
    totalCount: 0,     // how many questions the round started with
    firstTryCount: 0,  // how many were solved on their first appearance

    // --- only used while a spelling question is on screen ---
    answers: [],       // every spelling that counts as correct
    typed: "",         // the letters accepted so far
    pendingWrong: "",  // a wrong letter sitting there waiting to be backspaced
    backspacesLeft: 0, // fixes left on this question before it is skipped

    // --- only used while a click-the-map question is on screen ---
    wrongClicks: []    // states already clicked and already refused
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

  /* ==========================================================
     STARTING A ROUND
     ========================================================== */

  // main.js calls this to hand over control. It gets the round
  // back through whenFinished(), once the last question is done.
  function start(modeId, regions, whenFinished) {
    cancelTimers();

    const rules = MODE_RULES[modeId];
    if (!rules) {
      console.error("[quiz] mode " + modeId + " is not built yet.");
      return null;
    }

    // Every state in the picked regions, in random order.
    const states = QUIZ_DATA.items.filter(function (item) {
      return regions.indexOf(item.region) !== -1;
    });

    state = {
      modeId: modeId,
      rules: rules,
      regions: regions.slice(),
      queue: shuffle(states),
      current: null,
      attempts: 0,
      isRevisit: false,
      comeBack: [],
      points: 0,
      resolvedCount: 0,
      questionNumber: 0,
      totalCount: states.length,
      firstTryCount: 0,
      answers: [],
      typed: "",
      pendingWrong: "",
      backspacesLeft: 0,
      wrongClicks: []
    };

    onRoundEnd = whenFinished;

    // Click-the-map modes get more room for the map, because they have
    // no answer buttons underneath it. A bigger map means Rhode Island
    // is a bigger thing to hit.
    document.body.classList.toggle("is-map-click", isMapClick());

    // Every round starts with the map not listening and the zoom panel
    // away. The click modes switch both on; the others leave them off.
    USMap.setClickable(false);
    USMap.hideZoom();

    if (CONFIG.debug) {
      console.log("[quiz] round started:", {
        mode: modeId,
        asking_for: rules.asks,
        regions: regions,
        questions: state.totalCount
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
      state.comeBack.indexOf(state.current.abbr) !== -1;

    // Every spelling that counts as right. Nearly always just one,
    // but "Saint Paul" / "St. Paul" is why this is a list.
    const answer = state.current[state.rules.asks];
    state.answers = [answer].concat(state.current.capitalAlternates || []);
    state.typed = "";
    state.pendingWrong = "";
    state.backspacesLeft = CONFIG.backspacesPerQuestion;
    state.wrongClicks = [];

    updateHud();
    drawBackspaces();
    clearFeedback();
    hideTooltip();

    // Light up the state being asked about - EXCEPT in the click modes,
    // where lighting it up would be handing over the answer. There the
    // map stays blank and the question is read instead.
    if (isMapClick()) {
      USMap.clearAll();
    } else {
      USMap.highlight(state.current.abbr);
    }

    if (CONFIG.debug) {
      el("quiz-debug-answer").textContent =
        "Debug - the answer is: " + answer + " (" + state.current.abbr + ")";
    }

    if (state.isRevisit) {
      say("Let's try this one again!");
    }

    // Show the one answer area this mode uses, and hide the other two.
    const typing = (state.rules.answerWith === "typing");
    const clicking = isMapClick();
    el("quiz-choices").hidden = typing || clicking;
    el("quiz-typing").hidden = !typing;
    el("quiz-target").hidden = !clicking;

    if (typing) {
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

  // Mode 1: four buttons, one right answer.
  // Phase 3 will add askWithTyping() next to this.
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

      btn.addEventListener("click", function () { judgePick(btn, option); });
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

    const sameRegion = QUIZ_DATA.items.filter(function (item) {
      return item.region === state.current.region;
    });
    const inPlay = QUIZ_DATA.items.filter(function (item) {
      return state.regions.indexOf(item.region) !== -1;
    });

    // Best first, then widen out. The last pool (every state in the
    // game) only matters if the data is ever trimmed very small.
    const pools = [sameRegion, inPlay, QUIZ_DATA.items];
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
     MODE 9: FINDING IT ON THE MAP

     The name is READ, and the answer is given by clicking the
     right shape. The map is deliberately left blank, because a
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
    USMap.showZoom(el("quiz-zoom"));

    // Now the map will listen. It is switched off again the moment
    // the round ends, so it never answers questions on other screens.
    USMap.setClickable(true, judgeMapClick);
  }

  function judgeMapClick(abbr) {
    // Nothing is being asked right now (mid-flash, or the round is
    // over), so a stray click is just a click.
    if (!state.current || !isMapClick()) return;

    // Already refused once. Not a second strike - a double-click
    // should not be able to use up both chances in one go.
    if (state.wrongClicks.indexOf(abbr) !== -1) return;

    state.attempts++;

    if (abbr === state.current.abbr) {
      awardMapClick();
    } else if (state.attempts === 1) {
      state.wrongClicks.push(abbr);
      USMap.setLook(abbr, "is-wrong");
      Sound.play("wrong");
      say("Not that one. Try again!");
      logMath(0);
    } else {
      state.wrongClicks.push(abbr);
      USMap.setLook(abbr, "is-wrong");
      revealAndRetire();
    }
  }

  // Right state clicked. Same scoring as every other mode.
  function awardMapClick() {
    USMap.setClickable(false);
    USMap.setLook(state.current.abbr, "is-correct");
    USMap.showRing(state.current.abbr);
    Sound.play("correct");

    const gained = awardPoints();

    say(isSecondChance()
      ? "Right on the second try. +" + gained + " points"
      : "Yes! +" + gained + " points");

    later(CONFIG.feedbackSeconds, nextQuestion);
  }

  /* ==========================================================
     MODES 2 AND 3: SPELLING IT OUT

     How the typing works:
       - Only the correct next letter moves the word along.
       - A wrong letter LANDS, in red, and blocks everything
         until Backspace takes it away. That is what makes
         Backspace worth having.
       - Getting a letter wrong costs nothing. There is no way
         to fail a word by typing; a word ends either spelled
         or skipped.
       - The first letter of each word must be a capital. That
         is the one place where upper and lower case matter.
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

  // The spelling the player is working towards. With alternates,
  // it is whichever one still matches what has been typed so far.
  function targetAnswer() {
    const alive = state.answers.filter(function (candidate) {
      return startsWithTyped(candidate);
    });
    return alive.length ? alive[0] : state.answers[0];
  }

  function startsWithTyped(candidate) {
    return candidate.slice(0, state.typed.length) === state.typed;
  }

  // Is the letter at this position the start of a word? Those are
  // the only letters where a capital is required.
  function isWordStart(answer, position) {
    return position === 0 || answer.charAt(position - 1) === " ";
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

    const answer = targetAnswer();
    const position = state.typed.length;
    const wanted = answer.charAt(position);

    if (letter === wanted) {
      acceptLetter(letter, answer);
      return;
    }

    // Right letter, wrong case, at the start of a word: this is the
    // capitalization lesson, so say so instead of just buzzing.
    const rightLetterWrongCase =
      letter.toLowerCase() === wanted.toLowerCase();

    if (rightLetterWrongCase && isWordStart(answer, position)) {
      rejectLetter(letter);
      showTooltip(CAPITAL_TOOLTIP);
      return;
    }

    // Anywhere else, case does not matter. A stuck Caps Lock should
    // not punish him for spelling the word correctly.
    if (rightLetterWrongCase) {
      acceptLetter(wanted, answer);
      return;
    }

    rejectLetter(letter);
  }

  // In dash modes the gap between words is drawn for free, so it is
  // stepped over the moment the letter before it lands. He never types
  // a space in Mode 2. (Mode 3 has no dashes, so he does type it.)
  function absorbSpaces() {
    if (!state.rules.showDashes) return;
    const answer = targetAnswer();
    while (answer.charAt(state.typed.length) === " ") {
      state.typed += " ";
    }
  }

  function acceptLetter(letter, answer) {
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
    USMap.setLook(state.current.abbr, "is-correct");
    Sound.play("correct");
    el("quiz-skip").hidden = true;
    hideTooltip();

    const gained = awardPoints();
    say(state.isRevisit
      ? "Got it the second time! +" + gained + " points"
      : "Yes! +" + gained + " points");

    later(CONFIG.feedbackSeconds, nextQuestion);
  }

  // The Skip button. First time: the word goes to the back of the
  // line for one more try later. Second time: show it and retire it.
  function skipQuestion() {
    if (state.rules.answerWith !== "typing") return;

    hideTooltip();
    el("quiz-skip").hidden = true;

    if (state.isRevisit) {
      revealAndRetire();
      return;
    }

    state.comeBack.push(state.current.abbr);
    state.queue.push(state.current);

    say("No problem - this one comes back later.");
    logMath(0);
    later(CONFIG.feedbackSeconds, nextQuestion);
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

  // Was this the player's second and last chance at this question?
  // Multiple choice counts picks; spelling counts appearances.
  function isSecondChance() {
    return (state.rules.answerWith === "typing")
      ? state.isRevisit
      : (state.attempts > 1);
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
    updateHud();
  }

  // Right answer in a multiple-choice mode.
  function award(button) {
    button.classList.add("is-correct");
    USMap.setLook(state.current.abbr, "is-correct");
    Sound.play("correct");
    lockChoices();

    const gained = awardPoints();

    say(isSecondChance()
      ? "Right on the second try. +" + gained + " points"
      : "Yes! +" + gained + " points");

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
    const correct = state.current[state.rules.asks];

    Sound.play("wrong");
    USMap.setLook(state.current.abbr, "is-correct");

    // In the click modes the map was blank, so the green shape is the
    // only thing pointing at the answer. Ring it, or the eye has to
    // hunt for it. Clicking is switched off while it is being shown.
    if (isMapClick()) {
      USMap.setClickable(false);
      USMap.showRing(state.current.abbr);
    }

    say("The answer is " + correct + ".");

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

    const typing = state.rules && state.rules.answerWith === "typing";
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
      + " " + state.current.abbr
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

    // Clicking goes off FIRST. There is only one map and it gets moved
    // to other screens; a listener left on would answer questions
    // nobody is asking.
    USMap.setClickable(false);
    USMap.hideZoom();
    USMap.clearAll();

    el("quiz-choices").innerHTML = "";
    el("quiz-letters").innerHTML = "";
    el("quiz-skip").hidden = true;
    el("quiz-typing").hidden = true;
    el("quiz-target").hidden = true;
    el("hud-backspaces").hidden = true;
    document.body.classList.remove("is-map-click");
    hideTooltip();
    clearFeedback();

    // Nothing is being asked any more, so stray keystrokes do nothing.
    state.current = null;

    if (CONFIG.debug) {
      console.log("[quiz] round finished:", {
        points: state.points,
        firstTry: state.firstTryCount + " of " + state.totalCount
      });
    }

    if (onRoundEnd) {
      onRoundEnd({
        points: state.points,
        firstTryCount: state.firstTryCount,
        totalCount: state.totalCount
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

    // One printable character: a letter, or the space between words.
    if (event.key.length === 1) {
      event.preventDefault();
      typeLetter(event.key);
    }
  }

  document.addEventListener("keydown", handleKey);
  document.getElementById("quiz-skip")
    .addEventListener("click", skipQuestion);

  // Read-only peek at the round state, used by the HUD and by tests.
  function getState() {
    return state;
  }

  return {
    start: start,
    getState: getState,
    endRoundNow: endRoundNow,
    cancelTimers: cancelTimers
  };

})();
