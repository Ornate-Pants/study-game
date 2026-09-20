/* ============================================================
   SPELLING STORE - keeping the word lists
   ============================================================

   The word lists have to be changeable by somebody who does
   not open files in a text editor, so they are edited inside
   the game and kept in the browser's own storage box - the
   same place the high scores live.

   THE ONE RULE ABOUT WHERE THE WORDS COME FROM:

     Nothing saved yet?  use the lists in data/spelling.js.
     Anything saved?     use the saved ones, and never look
                         at data/spelling.js again.

   It is all-or-nothing on purpose. Merging the two - keeping
   the shipped lists and adding the saved ones - would mean a
   list you deleted kept coming back, and there would be no
   way to explain why.

   THE BACKUP IS NOT OPTIONAL. The browser's storage box is
   wiped by "clear browsing data", and it belongs to one
   browser on one computer. That is why the editor has a
   copy-and-paste box: the text in it is the whole set of
   lists, and pasting it back puts them all where they were.
   Paste it into an email to yourself once a term and a
   cleared browser stops being a disaster.
   ============================================================ */

const SpellingStore = (function () {

  const KEY = "studyGame.spelling.lists";

  /* --- Low-level read/write, safe if storage is unavailable ---
     Same reason as js/scores.js: some browsers turn storage off, and
     when they do the game should carry on with the starting lists
     rather than refuse to open. */

  function readRaw() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function writeRaw(value) {
    try {
      window.localStorage.setItem(KEY, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ==========================================================
     READING AND WRITING THE LISTS
     ========================================================== */

  // Every list, in order. Never returns nothing: if the saved data is
  // missing or damaged, the starting lists are handed back instead.
  function load() {
    const raw = readRaw();

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(tidyList);
      } catch (e) {
        // Saved data was damaged somehow. Fall through to the
        // starting lists rather than leave her with no game.
        console.warn("[spelling] saved word lists were unreadable;"
          + " using the starting ones.");
      }
    }

    return SPELLING_DATA.lists.map(tidyList);
  }

  function save(lists) {
    return writeRaw(JSON.stringify(lists.map(tidyList)));
  }

  // Throw the saved lists away and go back to the ones in
  // data/spelling.js. Only the editor's "Start Over" button uses this.
  function reset() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (e) { /* nothing to do */ }
    return load();
  }

  /* --- Tidying up what was typed ---

     WORDS PASTED OUT OF A WORD DOCUMENT are the thing this exists
     for. Word quietly turns an apostrophe into a curly one, so
     "don't" arrives as "don’t" - and the key on her keyboard makes
     the straight kind. She would type the word perfectly and be
     told she was wrong, with no way to see the difference. So the
     curly ones are straightened on the way in, before they can
     ever cause that. Same for the long dashes.  */

  function straighten(text) {
    return String(text)
      // Written as \u codes rather than the characters themselves,
      // because several of these are invisible in a text editor, or
      // look exactly like the ordinary ones.
      .replace(/[\u2018\u2019\u201B]/g, "'")   // curly apostrophes
      .replace(/[\u201C\u201D]/g, '"')         // curly quote marks
      .replace(/[\u2013\u2014]/g, "-")         // en dash and em dash
      .replace(/\u00A0/g, " ")                 // the space that is not a space
      .trim();
  }

  // Fill in anything a hand-edited or older list is missing, so the
  // rest of the game never has to check.
  function tidyList(list) {
    return {
      id: String(list.id || newId(list.name || "list")),
      name: String(list.name || "Untitled"),
      capsEnforced: !!list.capsEnforced,
      words: (list.words || []).map(function (entry) {
        // A list written as plain strings still works.
        if (typeof entry === "string") {
          return { word: straighten(entry), sentence: "" };
        }
        return {
          word: straighten(entry.word || ""),
          sentence: straighten(entry.sentence || "")
        };
      }).filter(function (entry) { return entry.word !== ""; })
    };
  }

  function byId(id) {
    const found = load().filter(function (list) { return list.id === id; });
    return found.length ? found[0] : null;
  }

  // A short id with no spaces, made from the name and kept unique.
  function newId(name, taken) {
    const used = taken || [];
    const base = String(name).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "list";

    let id = base;
    let n = 2;
    while (used.indexOf(id) !== -1) {
      id = base + "-" + n;
      n++;
    }
    return id;
  }

  /* ==========================================================
     CHECKING A WORD

     Two things can go wrong with a word typed into the
     editor, and both would trap her mid-round if they got
     through. This is where they get caught, before she ever
     sees the word.
     ========================================================== */

  // What a 7-year-old can find on a keyboard without help: letters,
  // the space bar, the apostrophe and the hyphen. Anything else is not
  // impossible - the game accepts any key - but it is a thing she will
  // hunt for while the clock is not running and her patience is.
  //
  // Curly apostrophes are NOT in this list on purpose, because they
  // never get here: straighten() above turns them into ordinary ones
  // before a word is ever saved.
  const EASY_TO_TYPE = /^[A-Za-z][A-Za-z '\-]*$/;

  function checkWord(entry, list, alreadySeen) {
    const word = entry.word;

    if (!EASY_TO_TYPE.test(word)) {
      return "has something in it besides letters, spaces, apostrophes"
        + " and hyphens - she will have to hunt for that key";
    }
    if (alreadySeen && alreadySeen.indexOf(word.toLowerCase()) !== -1) {
      return "is in this list twice, so it will be asked twice";
    }
    if (!list.capsEnforced && word !== word.toLowerCase()) {
      return "has a capital letter, but capitals are switched off for"
        + " this list, so it will not be required";
    }
    return null;
  }

  // Every problem in one list, as { word, note } pairs. An empty array
  // means there is nothing to say about it.
  function checkList(list) {
    const notes = [];
    const seen = [];

    list.words.forEach(function (entry) {
      const trouble = checkWord(entry, list, seen);
      if (trouble) notes.push({ word: entry.word, note: trouble });
      seen.push(entry.word.toLowerCase());
    });

    return notes;
  }

  /* ==========================================================
     THE COPY-AND-PASTE BACKUP

     One list per block. The heading line names the list and
     says whether capitals matter; every line after it is one
     word, with an optional sentence after a | bar.

         # Week of Sep 15 (caps: off)
         because
         their | Put on their coats.

     It is meant to be readable and to survive being pasted
     through an email, which rules out anything clever.
     ========================================================== */

  function toText(lists) {
    return lists.map(function (list) {
      const head = "# " + list.name
        + " (caps: " + (list.capsEnforced ? "on" : "off") + ")";

      const lines = list.words.map(function (entry) {
        return entry.sentence
          ? entry.word + " | " + entry.sentence
          : entry.word;
      });

      return [head].concat(lines).join("\n");
    }).join("\n\n");
  }

  // Read that text back. Anything it cannot make sense of is skipped
  // rather than thrown out wholesale: half a list back is better than
  // none, and the editor shows what arrived.
  function fromText(text) {
    const lists = [];
    const usedIds = [];
    let current = null;

    String(text).split(/\r?\n/).forEach(function (raw) {
      const line = raw.trim();
      if (line === "") return;

      if (line.charAt(0) === "#") {
        const head = line.slice(1).trim();

        // "(caps: on)" at the end, if it is there at all.
        let name = head;
        let caps = false;
        const match = head.match(/\(caps:\s*(on|off)\s*\)\s*$/i);
        if (match) {
          caps = match[1].toLowerCase() === "on";
          name = head.slice(0, match.index).trim();
        }

        const id = newId(name, usedIds);
        usedIds.push(id);
        current = { id: id, name: name || "Untitled",
                    capsEnforced: caps, words: [] };
        lists.push(current);
        return;
      }

      // A word before any heading gets a list of its own to sit in.
      if (!current) {
        const id = newId("Word List", usedIds);
        usedIds.push(id);
        current = { id: id, name: "Word List",
                    capsEnforced: false, words: [] };
        lists.push(current);
      }

      const bar = line.indexOf("|");
      if (bar === -1) {
        current.words.push({ word: line, sentence: "" });
      } else {
        current.words.push({
          word: line.slice(0, bar).trim(),
          sentence: line.slice(bar + 1).trim()
        });
      }
    });

    return lists.map(tidyList).filter(function (list) {
      return list.words.length > 0;
    });
  }

  return {
    load: load,
    save: save,
    reset: reset,
    byId: byId,
    newId: newId,
    straighten: straighten,
    checkList: checkList,
    toText: toText,
    fromText: fromText
  };

})();
