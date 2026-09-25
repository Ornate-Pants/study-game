/* ============================================================
   SPEECH - reading the word out loud
   ============================================================

   The spelling game cannot put the word on screen. Showing it
   would be showing her the spelling, which is the one thing
   the game is meant to be asking for. So the word is SPOKEN,
   using the voice that is already installed on the computer.

   Nothing is downloaded and there are no sound files. The
   browser has a built-in reader - the same one that reads
   pages aloud - and this file borrows it. That keeps the
   "double-click it, no internet" rule intact.

   WHAT TO CHANGE, AND WHERE: how fast and how high the voice
   speaks are two numbers in data/config.js (speechRate and
   speechPitch), along with whether the word is said twice.
   Nothing about the voice is typed into this file.

   IF THERE IS NO VOICE ON THE COMPUTER the spelling game
   cannot work at all, and this file says so out loud rather
   than going quiet: the game-select screen greys the spelling
   card out and explains why. It must NEVER quietly fall back
   to showing the word instead, because that would turn a
   spelling test into a copying exercise without telling
   anyone it had.
   ============================================================ */

const Speech = (function () {

  // The browser's reader. Missing on very old browsers.
  const engine = window.speechSynthesis || null;

  // The voice we picked, once we have one. Voices arrive late (see
  // below), so this starts empty and fills in.
  let voice = null;

  // Set to true the first time the reader actually refuses to speak.
  // Until then, an empty voice list is treated as "not ready yet"
  // rather than "broken" - the two look identical for a second or so
  // after the page opens.
  let refused = false;

  // Things to tell when that changes. A computer with no voice only
  // gives itself away a moment AFTER being asked to speak, long after
  // the screen asking has finished drawing itself. So screens that need
  // to react ask to be told, rather than checking once and believing
  // the answer. Every listener is written to cope with being told
  // either way round, because a voice can also turn up late.
  let toTell = [];

  function tellEveryone() {
    toTell.slice().forEach(function (fn) {
      try { fn(); } catch (e) { /* a broken listener is not fatal */ }
    });
  }

  function giveUp(why) {
    if (refused) return;
    refused = true;
    console.warn("[speech] this computer cannot read words out loud ("
      + why + ")");
    tellEveryone();
  }

  // True once the reader itself has refused, as opposed to us simply
  // not finding a voice in the list. The difference matters: a missing
  // list can fill in later, a refusal will not.
  let hardRefusal = false;

  // A voice turned up after we had written this computer off. Only the
  // waiting-around check below can be wrong in this direction; a reader
  // that actually refused to speak is not given a second chance.
  function revive() {
    if (!refused || hardRefusal) return;
    refused = false;
    tellEveryone();
  }

  // Be told whenever this changes, in either direction.
  function whenChanged(fn) {
    toTell.push(fn);
  }

  // Everything said since the current question was asked, in order.
  // Nothing in the game uses it; it is here so the test suite can check
  // WHAT WOULD BE SAID on a computer with no voices installed, which is
  // most test machines. Checking the words that were handed over is the
  // only way to test this without a voice to listen to.
  let script = [];

  // Timers for the parts of a question said after a pause, so stop()
  // can call them off.
  let waiting = [];

  /* ==========================================================
     PICKING A VOICE

     Two things make this fiddlier than it looks.

     ONE: the list of voices is not ready when the page opens.
     The browser fills it in a moment later and fires an event
     to say so - except when it has them already and fires
     nothing. So we listen for the event AND look again on a
     short timer, and take whichever gets there first.

     TWO: some voices are not really on the computer. Chrome
     lists several Google voices that are fetched over the
     internet each time they speak. Those are no good here -
     the whole game is built to work with the internet off -
     so a voice that says it is local is always preferred.
     ========================================================== */

  function choose() {
    if (!engine) return null;

    let voices = [];
    try {
      voices = engine.getVoices() || [];
    } catch (e) {
      return null;
    }
    if (!voices.length) return null;

    const english = voices.filter(function (v) {
      return (v.lang || "").toLowerCase().indexOf("en") === 0;
    });

    // Best: an English voice that lives on this computer.
    const local = english.filter(function (v) { return v.localService; });
    if (local.length) return local[0];

    // Next best: any English voice, even one that needs the internet.
    // Better a voice that sometimes fails than no game at all.
    if (english.length) return english[0];

    // Last resort: whatever the browser has. It will have an accent
    // from somewhere else, but it can still say the word.
    return voices[0];
  }

  function refresh() {
    if (!voice) voice = choose();
    if (voice) revive();
    return voice;
  }

  if (engine) {
    refresh();
    // Fires when the list arrives. Some browsers never fire it.
    if (typeof engine.addEventListener === "function") {
      engine.addEventListener("voiceschanged", refresh);
    }
    // ...so look again anyway, a few times, a moment apart.
    setTimeout(refresh, 250);
    setTimeout(refresh, 1200);

    // GIVING UP EARLY, ON PURPOSE. Without this, a computer with no
    // voice looks fine until she has picked the game, picked a mode,
    // picked a list, started a round and heard nothing. Three seconds
    // is far longer than any browser takes to fill the list in, so an
    // empty one by then means empty. If a voice does turn up later,
    // refresh() above takes the decision back.
    setTimeout(function () {
      if (!refresh()) giveUp("no voices installed");
    }, CONFIG.speechWaitSeconds * 1000);
  }

  /* ==========================================================
     SAYING SOMETHING
     ========================================================== */

  // Is there a voice to speak with? Used by the game-select screen to
  // decide whether the spelling card can be played at all.
  function isAvailable() {
    if (!engine || typeof window.SpeechSynthesisUtterance !== "function") {
      return false;
    }
    if (refused) return false;
    // No voice yet may just mean the list has not arrived. Say yes and
    // let the first attempt settle it; a real refusal sets "refused".
    return true;
  }

  // Speak one piece of text. Everything else in this file goes
  // through here.
  //
  // Nothing ever WAITS for this to finish. A word that fails to speak
  // must not be able to freeze the question it belongs to, and on a
  // computer with no voices the reader reports a failure and never
  // reports finishing - so waiting would wait forever.
  function utter(text, delaySeconds) {
    script.push(text);

    if (!engine || typeof window.SpeechSynthesisUtterance !== "function") {
      return;
    }

    const go = function () {
      try {
        const line = new window.SpeechSynthesisUtterance(text);
        const picked = refresh();
        if (picked) line.voice = picked;
        line.rate = CONFIG.speechRate;
        line.pitch = CONFIG.speechPitch;
        line.volume = 1;

        // The reader refusing is worth knowing about once: it is how we
        // find out this computer has no voice. It is not worth knowing
        // about twice, so nothing is logged after the first time.
        //
        // NOT EVERY "ERROR" IS A REFUSAL. The reader also reports an
        // error when stop() cuts a word off ("interrupted") or throws
        // away one still waiting its turn ("canceled"). stop() runs
        // before every question and every "Say it again", so treating
        // those as refusals told a computer WITH a voice that it had
        // none. They are ignored.
        //
        // "not-allowed" means the browser wanted a click first. That
        // can come right later, so it is not a permanent refusal.
        line.onerror = function (event) {
          const why = (event && event.error) || "no reason given";
          if (why === "interrupted" || why === "canceled") return;
          if (why !== "not-allowed") hardRefusal = true;
          giveUp(why);
        };

        engine.speak(line);
      } catch (e) {
        hardRefusal = true;
        giveUp(e && e.message);
      }
    };

    if (delaySeconds > 0) {
      waiting.push(setTimeout(go, delaySeconds * 1000));
    } else {
      go();
    }
  }

  // Stop whatever is being said. Called before every new word, so that
  // pressing "Say it again" five times says it once more rather than
  // queueing five copies up behind each other.
  //
  // It also forgets the parts of the last question still waiting to be
  // said (the sentence, the word again). Without that, answering
  // quickly meant the OLD word was read out during the NEW question.
  function stop() {
    waiting.forEach(clearTimeout);
    waiting = [];
    if (!engine) return;
    try {
      engine.cancel();
    } catch (e) { /* nothing to do */ }
  }

  // One word on its own. Used by the word-list editor's preview
  // buttons, so a word can be heard before she ever meets it.
  function sayWord(word) {
    stop();
    script = [];
    utter(word, 0);
  }

  /* ==========================================================
     ASKING A SPELLING QUESTION

     The word, then the example sentence if there is one, then
     the word again.

     The sentence is what makes homophones possible at all.
     "their" and "there" sound exactly the same, so on its own
     the question has no right answer - but "their. Put on
     their coats. their." does. Most words need no sentence
     and are left blank.

     Saying the word again at the end is so she does not have
     to remember it through the sentence.
     ========================================================== */

  function sayQuestion(item) {
    stop();
    script = [];

    const word = item.word;
    const sentence = (item.sentence || "").trim();

    utter(word, 0);

    if (sentence) {
      utter(sentence, CONFIG.speechGapSeconds);
    }

    if (CONFIG.sayWordTwice) {
      // Long enough after the sentence that the two do not run
      // together. With no sentence it is just a short pause.
      const after = sentence
        ? CONFIG.speechGapSeconds * 2 + sentence.length * 0.06
        : CONFIG.speechGapSeconds * 2;
      utter(word, after);
    }
  }

  // What was handed to the reader for the question on screen now: the
  // word, the sentence if there is one, then the word again. For the
  // test suite only - it lets a check confirm the RIGHT THING would be
  // said on a machine that has no voice to say it with.
  function debugScript() {
    return script.slice();
  }

  function debugLast() {
    return script.length ? script[script.length - 1] : "";
  }

  // A one-line summary for the debug self-check in the console.
  function describe() {
    if (!engine) return "no reader in this browser";
    const picked = refresh();
    if (!picked) return "no voice found (yet)";
    return picked.name + " (" + picked.lang + ")"
      + (picked.localService ? ", on this computer" : ", needs internet");
  }

  return {
    isAvailable: isAvailable,
    whenChanged: whenChanged,
    sayWord: sayWord,
    sayQuestion: sayQuestion,
    stop: stop,
    debugLast: debugLast,
    debugScript: debugScript,
    describe: describe
  };

})();
