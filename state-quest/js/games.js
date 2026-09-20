/* ============================================================
   GAMES - the list of games, and how each one differs
   ============================================================

   There is ONE question engine (js/quiz.js) and more than one
   game. This file is the only place that says how the games
   differ from each other.

   Before this file existed, the engine talked to the US map
   and to the states data directly, by name. That worked while
   there was only one subject. Adding spelling meant the engine
   had to stop knowing what a "state" is - so everything that
   is specific to a subject moved in here, and the engine now
   asks a GAME for it.

   TO ADD A THIRD GAME LATER, add one entry below. You should
   not have to open js/quiz.js at all.

   WHAT AN ENTRY HAS TO PROVIDE
   ---------------------------------------------------------
     id             a short name, also the localStorage key and
                    the CSS colour theme (body[data-game="..."])
     name, blurb    what the game-select screen shows
     groupLabel     what its questions are grouped BY. The map
                    game groups states into regions; the spelling
                    game groups words into weekly lists.
     modes          the cards on the Pick a Game screen
     rules          one line per mode, telling the engine what
                    to ask for and how it is answered
     getGroups()    { id: name } for the tick-box screen
     getItems(ids)  the questions for a round
     itemKey(item)  a unique id for one question. The map game
                    used the 2-letter state code for this; the
                    engine now calls this instead, so it never
                    has to know that state codes exist.
     itemGroup(i)   which group that question came from
     alternates(i)  other spellings that also count as right
     labelFor(key)  turn a key back into something readable
     stage          the part of the screen the question appears
                    ON: the map for one game, the voice for the
                    other. See the note above "stage" below.
   ============================================================ */

/* ============================================================
   THE STAGE

   Every game has somewhere the question APPEARS. For the US
   game that is the map: a state lights up, a wrong click turns
   red, a ring points at the answer. For the spelling game
   there is nothing to look at at all - the word is SPOKEN,
   because putting it on screen would be showing her the
   spelling.

   Those two have nothing in common, so the engine does not
   talk to either of them directly. It calls these nine
   methods, and each game answers them its own way. The
   spelling game's stage does nothing at all for most of them,
   which is exactly the point.
   ============================================================ */

const GAMES = (function () {

  /* ----------------------------------------------------------
     THE US MAP STAGE - what the engine used to call directly
     ---------------------------------------------------------- */
  const mapStage = {
    // Does this stage SPEAK the question? The quiz screen shows the
    // "Say it again" button only where there is something to say again.
    speaks: false,

    // Mount the map into whichever screen is about to show it.
    mountInto: function (box) { USMap.mountInto(box); },

    // Ask the question: light up the state being asked about.
    present: function (item) { USMap.highlight(item.abbr); },

    // Ask it again. On the map the state is still lit, so there
    // is nothing to repeat - it never stopped being asked.
    repeat: function () { },

    markCorrect: function (key) { USMap.setLook(key, "is-correct"); },
    markWrong:   function (key) { USMap.setLook(key, "is-wrong"); },
    markChosen:  function (key) { USMap.setLook(key, "is-chosen"); },

    showRing:    function (key) { USMap.showRing(key); },
    clearAll:    function () { USMap.clearAll(); },

    setClickable: function (on, whenClicked) {
      USMap.setClickable(on, whenClicked);
    },

    showZoom: function (box) { USMap.showZoom(box); },
    hideZoom: function () { USMap.hideZoom(); },

    // The round is over. Clicking goes off FIRST: there is only
    // one map and it gets moved to other screens, so a listener
    // left on would answer questions nobody is asking.
    teardown: function () {
      USMap.setClickable(false);
      USMap.hideZoom();
      USMap.clearAll();
    }
  };

  /* ----------------------------------------------------------
     GAME 1: UNITED STATES STUDY

     Everything here was living inside js/quiz.js and
     js/main.js until the spelling game arrived. Nothing about
     it has changed; it has only moved.
     ---------------------------------------------------------- */

  const states = {
    id: "states",
    name: "United States Study",
    blurb: "States, capitals, abbreviations and the map.",

    groupLabel: "Regions",
    groupLabelOne: "region",
    groupHeading: "Pick Your Regions",
    groupLead: "Check the boxes for the parts you want to practice. "
             + "Pick as many as you like.",
    itemWord: "questions",
    bonusLabel: "Region bonus",
    scoreColumn: "Regions",

    // The map preview only means anything to this game.
    usesMap: true,

    /* --- The cards on the Pick a Game screen ---
       "status" controls whether a mode can be picked.
         "ready" = playable now
         "soon"  = shown greyed out with a "Coming Soon" label
       To turn a mode on later, change one word. Nothing else. */
    modes: [
      { id: 1,  name: "State Match",                blurb: "See a state. Pick its name.",       status: "ready" },
      { id: 2,  name: "State Speller",              blurb: "See a state. Spell its name.",      status: "ready" },
      { id: 3,  name: "State Speller: Hard Mode",   blurb: "Spell it with no help at all.",     status: "ready" },
      { id: 4,  name: "Capital Match",              blurb: "See a state. Pick its capital.",    status: "ready" },
      { id: 5,  name: "Capital Speller",            blurb: "See a state. Spell its capital.",   status: "ready" },
      { id: 6,  name: "Capital Speller: Hard Mode", blurb: "Spell the capital with no help.",   status: "ready" },
      { id: 7,  name: "Abbreviation Match",         blurb: "See a state. Pick its 2 letters.",  status: "ready" },
      { id: 8,  name: "Abbreviation: Hard Mode",    blurb: "Type the 2 letters yourself.",      status: "ready" },
      { id: 9,  name: "Find the State",             blurb: "Read a name. Click it on the map.", status: "ready" },
      { id: 10, name: "Find the Capital's State",   blurb: "Read a capital. Click its state.",  status: "ready" }
    ],

    /* --- WHAT EACH MODE ASKS FOR ---

       "asks" is which field of a state the player must produce.
       "answerWith" is how they produce it.
       Adding a mode later means adding a line here, not
       rewriting the engine.

       The other switches, all optional:
         showFirstLetter  start the word off with its first letter
         showDashes       show a dash for every letter still to come
         hint             offer the Hint button
         hintStyle        what the Hint button GIVES. "name" tells
                          you which state is lit up.
         allCaps          every letter must be a capital (Mode 8's
                          abbreviations - "ME", never "Me" or "me")
         showsTargetText  the question is READ, because the map is
                          the answer sheet and must give nothing away */
    rules: {
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

      /* --- The capitals. Same three engines, pointed at the
             "capital" field instead of "name". The map still lights the
             state up, so the question is "which city belongs to THIS
             shape" - and the Hint button names the shape. --- */
      4: {
        asks: "capital",
        answerWith: "choices",
        hint: true,
        hintStyle: "name",
        prompt: "What is the capital of the state that is lit up?"
      },
      5: {
        asks: "capital",
        answerWith: "typing",
        showFirstLetter: true,
        showDashes: true,
        hint: true,
        hintStyle: "name",
        prompt: "Spell the capital of the state that is lit up."
      },
      6: {
        asks: "capital",
        answerWith: "typing",
        showFirstLetter: false,
        showDashes: false,
        hint: true,
        hintStyle: "name",
        prompt: "Spell the capital. No letters to help you this time!"
      },

      /* --- The two-letter codes. Mode 8 is the one place in
             the game where EVERY letter has to be a capital. --- */
      7: {
        asks: "abbr",
        answerWith: "choices",
        prompt: "Which 2 letters stand for the state that is lit up?"
      },
      8: {
        asks: "abbr",
        answerWith: "typing",
        showFirstLetter: false,
        showDashes: false,
        allCaps: true,
        hint: true,
        hintStyle: "name",
        prompt: "Type the 2 letters for the state that is lit up."
      },

      9: {
        asks: "name",
        answerWith: "mapClick",
        // The map is the ANSWER SHEET in this mode, so it must not light
        // anything up. The question is read instead, in big letters.
        showsTargetText: true,
        prompt: "Find this state on the map."
      },

      // Mode 10 is Mode 9 with one word changed. The thing READ OUT is
      // the capital; the thing CLICKED is still a state, and the click is
      // still judged on the state's abbr - so none of the engine code
      // needed to learn anything new.
      10: {
        asks: "capital",
        answerWith: "mapClick",
        showsTargetText: true,
        prompt: "Which state has this capital city? Find it on the map."
      }
    },

    getGroups: function () {
      return QUIZ_DATA.regions;
    },

    // The tick boxes on screen carry their group's key as TEXT, because
    // that is all an HTML attribute can hold. This turns one back into
    // whatever the data really uses - a number here, a list id in the
    // spelling game.
    groupIdFromKey: function (key) {
      return parseInt(key, 10);
    },

    // Which of the ten coloured dots this group gets. The regions have
    // fixed colours, because the dot is the map's key: the dot next to
    // "New England" is the colour New England turns on the map.
    swatchFor: function (key) {
      return parseInt(key, 10);
    },

    getItems: function (groupIds) {
      return QUIZ_DATA.items.filter(function (item) {
        return groupIds.indexOf(item.region) !== -1;
      });
    },

    // Every state in the game, whichever regions were picked. Used
    // only to fill out the four multiple-choice buttons when the
    // picked regions are too small to supply three wrong answers.
    getAllItems: function () {
      return QUIZ_DATA.items;
    },

    itemKey:    function (item) { return item.abbr; },
    itemGroup:  function (item) { return item.region; },
    alternates: function (item) { return item.capitalAlternates || []; },

    labelFor: function (key) {
      const found = QUIZ_DATA.items.filter(function (item) {
        return item.abbr === key;
      });
      return found.length ? found[0].name : key;
    },

    // What the exam review screen prints for one question. In the
    // clicking modes the thing to find is a STATE - even in Mode 10,
    // where the question was a city - so the state is the answer and
    // the city is the question.
    examQuestionLabel: function (item, rules) {
      return (rules.answerWith === "mapClick") ? item[rules.asks] : item.name;
    },
    examCorrectLabel: function (item, rules) {
      return (rules.answerWith === "mapClick") ? item.name : item[rules.asks];
    },

    // What the Hint button reveals in Modes 4, 5, 6 and 8. Those four
    // light a state up and then ask for something that is NOT its name,
    // so the hint says which state you are looking at - where you are
    // standing, not what the answer is.
    hintText: function (item) {
      return "This state is " + item.name + ".";
    },

    // The answer said out loud after a miss. In the click modes the
    // thing to find is a state, so the state is named and the city is
    // tied back to it.
    answerText: function (item, rules) {
      if (rules.answerWith === "mapClick" && rules.asks !== "name") {
        return item.name + ", where " + item[rules.asks] + " is the capital";
      }
      return item[rules.asks];
    },

    stage: mapStage
  };

  /* ----------------------------------------------------------
     THE SPELLING STAGE

     There is nothing to look at. The word is SPOKEN, because
     putting it on screen would be showing her the spelling,
     which is the one thing the game is asking for. So most of
     these do nothing at all - the green letters and the red
     ones already say whether an answer was right, and there
     is no map to light up, ring or listen to.
     ---------------------------------------------------------- */

  const voiceStage = {
    speaks: true,

    mountInto: function () { },

    // Ask the question: read the word out loud.
    present: function (item) { Speech.sayQuestion(item); },

    // Ask it AGAIN. Unlike the map, a spoken word does not stay
    // on screen, so this one really does something - and it is
    // free and unlimited, because hearing the question a second
    // time is the question being repeated, not help with it.
    repeat: function (item) { Speech.sayQuestion(item); },

    markCorrect: function () { },
    markWrong:   function () { },
    markChosen:  function () { },
    showRing:    function () { },
    clearAll:    function () { },
    setClickable: function () { },
    showZoom: function () { },
    hideZoom: function () { },

    // Stop the voice. Without this, a word still being read when
    // the round ends carries on talking over the score screen.
    teardown: function () { Speech.stop(); }
  };

  /* ----------------------------------------------------------
     GAME 2: SPELLING LIST

     Two modes, the same two the US game has for state names -
     one with the first letter and a dash per remaining letter,
     one with nothing at all.

     The words come from whatever lists have been saved, which
     is why almost everything here asks SpellingStore rather
     than holding a list of its own.
     ---------------------------------------------------------- */

  const spelling = {
    id: "spelling",
    name: "Spelling List",
    blurb: "Listen to a word, then spell it out.",

    groupLabel: "Lists",
    groupLabelOne: "list",
    groupHeading: "Pick Your Word Lists",
    groupLead: "Check the lists you want to practice. "
             + "Pick as many as you like.",
    itemWord: "words",
    bonusLabel: "Word list bonus",
    scoreColumn: "Lists",

    usesMap: false,
    editableLists: true,   // this is the game the gear button belongs to

    // The game cannot be played on a computer with no voice, and
    // saying so plainly beats letting her open a game that will
    // sit there silent.
    unavailableReason: function () {
      return Speech.isAvailable()
        ? null
        : "This computer has no voice installed, so it cannot read"
          + " the words out loud.";
    },

    modes: [
      { id: 1, name: "Spelling Practice",
        blurb: "Hear a word. The first letter and a dash for each of the rest.",
        status: "ready" },
      { id: 2, name: "Spelling: Hard Mode",
        blurb: "Hear a word. Spell it with no help at all.",
        status: "ready" }
    ],

    /* --- The two modes. Same switches the US game's spelling modes
           use, and they mean exactly the same things.

           hintStyle: "nextLetter" is the one new idea. In the US game
           the Hint button names the state that is lit up; here there
           is no map to name, so it fills in one letter of the word
           instead. It costs the same flat 2 points either way. --- */
    rules: {
      1: {
        asks: "word",
        answerWith: "typing",
        showFirstLetter: true,    // starts with the first letter filled in
        showDashes: true,         // and a dash for every letter to come
        hint: true,
        hintStyle: "nextLetter",
        prompt: "Listen, then spell the word."
      },
      2: {
        asks: "word",
        answerWith: "typing",
        showFirstLetter: false,   // no head start
        showDashes: false,        // and no clue how long the word is
        hint: true,
        hintStyle: "nextLetter",
        prompt: "Listen, then spell the word. No letters to help you!"
      }
    },

    // { listId: listName } for the tick-box screen.
    getGroups: function () {
      const out = {};
      SpellingStore.load().forEach(function (list) {
        out[list.id] = list.name;
      });
      return out;
    },

    // A list id is already text, so there is nothing to convert.
    groupIdFromKey: function (key) {
      return String(key);
    },

    // Word lists have no fixed colours of their own - there is no map
    // for them to match - so the dots are handed out by position and
    // wrap round after ten, purely so two lists on screen look
    // different from each other.
    swatchFor: function (key, index) {
      return ((index || 0) % 10) + 1;
    },

    getItems: function (groupIds) {
      const out = [];
      SpellingStore.load().forEach(function (list) {
        if (groupIds.indexOf(list.id) === -1) return;
        list.words.forEach(function (entry) {
          out.push({
            word: entry.word,
            sentence: entry.sentence || "",
            list: list.id,
            // Carried on every word so the engine can ask whether
            // capitals matter without knowing what a list is.
            capsEnforced: list.capsEnforced
          });
        });
      });
      return out;
    },

    getAllItems: function () {
      const everything = [];
      SpellingStore.load().forEach(function (list) {
        everything.push(list.id);
      });
      return spelling.getItems(everything);
    },

    // The word itself tells two questions apart. Two lists can share a
    // word, and that is fine - it would be asked once per list, which
    // is what practising it twice looks like.
    itemKey:    function (item) { return item.word; },
    itemGroup:  function (item) { return item.list; },

    // No alternate spellings. A spelling list has one right answer per
    // word; that is what makes it a spelling list.
    alternates: function () { return []; },

    labelFor: function (key) { return key; },

    // Capitals are required only where the word has one AND the list
    // it came from has capitals switched on. This is the one switch
    // the "Capital letters must match" tick box controls.
    capsOptional: function (item) {
      return !item.capsEnforced;
    },

    // The review screen after an exam. The question WAS the word,
    // spoken, so the word is both.
    examQuestionLabel: function (item) { return item.word; },
    examCorrectLabel:  function (item) { return item.word; },

    hintText: function () { return ""; },   // never used: hints are letters here

    answerText: function (item) { return item.word; },

    stage: voiceStage
  };

  /* ----------------------------------------------------------
     THE LIST

     The order here is the order the cards appear in on the
     game-select screen.
     ---------------------------------------------------------- */

  const ALL = [states, spelling];

  function byId(id) {
    for (let i = 0; i < ALL.length; i++) {
      if (ALL[i].id === id) return ALL[i];
    }
    return null;
  }

  return {
    all: ALL,
    byId: byId,
    states: states,
    spelling: spelling
  };

})();
