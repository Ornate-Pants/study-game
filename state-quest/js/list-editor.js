/* ============================================================
   LIST EDITOR - changing the spelling words
   ============================================================

   The screen behind the gear button. The whole point of it is
   that next week's words can be put in by somebody who never
   opens a file in a text editor.

   WHY THE WORDS ARE ONE BIG BOX and not a row per word:
   pasting twelve words off a school handout into one box takes
   five seconds. Building twelve rows one at a time takes two
   minutes and eleven clicks. The one thing a box loses is that
   a typo can hide in it - so everything typed is read back
   underneath, word by word, with a button to hear each one.
   Nothing is silently misunderstood.

   WHAT IS TYPED IS NEVER LOST. The lists on screen are a copy,
   written back when Save is pressed - and also on the way out,
   whether that is the Done button or the Back arrow. Somebody
   who has just typed twelve words and pressed the wrong button
   should not lose them, and "which button saves?" is not a
   thing to have to know.
   ============================================================ */

const ListEditor = (function () {

  // The lists as they are being edited. A COPY of what is saved.
  let lists = [];

  // Which one is open, by id.
  let openId = null;

  function el(id) {
    return document.getElementById(id);
  }

  /* ==========================================================
     OPENING AND CLOSING
     ========================================================== */

  function open() {
    lists = SpellingStore.load();
    openId = lists.length ? lists[0].id : null;

    if (!lists.length) {
      addList();     // never show an empty screen with nothing to do
    }

    drawListButtons();
    drawOpenList();
    drawBackup();
    say("");
  }

  function current() {
    const found = lists.filter(function (list) { return list.id === openId; });
    return found.length ? found[0] : null;
  }

  /* ==========================================================
     THE LIST OF LISTS
     ========================================================== */

  function drawListButtons() {
    const holder = el("editor-list-buttons");
    holder.innerHTML = "";

    lists.forEach(function (list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "editor-list-button"
        + (list.id === openId ? " is-open" : "");

      const name = document.createElement("span");
      name.className = "editor-list-name";
      name.textContent = list.name;
      btn.appendChild(name);

      const count = document.createElement("span");
      count.className = "editor-list-count";
      count.textContent = list.words.length + " words"
        + (list.capsEnforced ? "  •  capitals on" : "");
      btn.appendChild(count);

      btn.addEventListener("click", function () {
        // Whatever is typed into the open list is kept when moving to
        // another one. Losing it because you clicked the wrong list
        // would be a nasty surprise.
        gatherOpenList();
        openId = list.id;
        drawListButtons();
        drawOpenList();
      });

      holder.appendChild(btn);
    });
  }

  function addList() {
    const taken = lists.map(function (list) { return list.id; });
    const name = "New List";
    const list = {
      id: SpellingStore.newId(name, taken),
      name: name,
      capsEnforced: false,
      words: []
    };
    lists.push(list);
    openId = list.id;
  }

  /* ==========================================================
     THE OPEN LIST
     ========================================================== */

  function drawOpenList() {
    const list = current();
    if (!list) return;

    el("editor-name").value = list.name;
    el("editor-caps").checked = list.capsEnforced;
    el("editor-words").value = list.words.map(function (entry) {
      return entry.sentence
        ? entry.word + " | " + entry.sentence
        : entry.word;
    }).join("\n");

    // The last list standing cannot be deleted: with no lists at all
    // there would be nothing to tick on the Pick Your Word Lists
    // screen, and no way back except knowing about this button.
    el("editor-delete").disabled = (lists.length <= 1);

    drawPreview();
  }

  // Read the boxes back into the list being edited. Called before
  // anything that would otherwise lose what is typed.
  function gatherOpenList() {
    const list = current();
    if (!list) return;

    list.name = el("editor-name").value.trim() || "Untitled";
    list.capsEnforced = el("editor-caps").checked;
    list.words = readWordBox();
  }

  // One line, one word. Everything after a | bar is the example
  // sentence. Blank lines are ignored, so a stray Return does nothing.
  //
  // Straightened here, not only on save, so that the read-back below
  // shows EXACTLY what the game will ask for. A curly apostrophe
  // pasted out of a Word document becomes an ordinary one, and it does
  // so somewhere it can be seen.
  function readWordBox() {
    return el("editor-words").value.split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ""; })
      .map(function (line) {
        const bar = line.indexOf("|");
        return (bar === -1)
          ? { word: SpellingStore.straighten(line), sentence: "" }
          : { word: SpellingStore.straighten(line.slice(0, bar)),
              sentence: SpellingStore.straighten(line.slice(bar + 1)) };
      })
      .filter(function (entry) { return entry.word !== ""; });
  }

  /* ==========================================================
     READING IT BACK

     Every word as the game understood it, with a button to
     hear it. This is where a voice that says a word oddly gets
     found - before she meets it in a round and has no idea
     what she is being asked to spell.
     ========================================================== */

  function drawPreview() {
    const holder = el("editor-preview");
    const notes = el("editor-notes");
    holder.innerHTML = "";
    notes.innerHTML = "";

    const words = readWordBox();
    const pretend = {
      capsEnforced: el("editor-caps").checked,
      words: words
    };

    if (!words.length) {
      const none = document.createElement("p");
      none.className = "editor-help";
      none.textContent = "No words yet. Type some above, one per line.";
      holder.appendChild(none);
      return;
    }

    words.forEach(function (entry) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "editor-chip";
      chip.addEventListener("click", function () {
        // Exactly what the game would say, sentence and all.
        Speech.sayQuestion(entry);
      });

      const speaker = document.createElement("span");
      speaker.className = "editor-chip-icon";
      speaker.textContent = "\u{1F50A}";
      speaker.setAttribute("aria-hidden", "true");
      chip.appendChild(speaker);

      const word = document.createElement("span");
      word.className = "editor-chip-word";
      word.textContent = entry.word;
      chip.appendChild(word);

      if (entry.sentence) {
        const sentence = document.createElement("span");
        sentence.className = "editor-chip-sentence";
        sentence.textContent = entry.sentence;
        chip.appendChild(sentence);
      }

      holder.appendChild(chip);
    });

    // Anything worth flagging: a word that cannot be typed in the
    // game, one that is in twice, or a capital that will not be asked
    // for. None of these stop a save - they are notes, not refusals.
    SpellingStore.checkList(pretend).forEach(function (item) {
      const line = document.createElement("p");
      line.className = "editor-note";
      line.textContent = "⚠ “" + item.word + "” " + item.note;
      notes.appendChild(line);
    });

    if (!Speech.isAvailable()) {
      const line = document.createElement("p");
      line.className = "editor-note";
      line.textContent = "⚠ This computer has no voice installed,"
        + " so the words cannot be read out loud here or in the game.";
      notes.appendChild(line);
    }
  }

  /* ==========================================================
     SAVING
     ========================================================== */

  function save() {
    gatherOpenList();

    // A list with no words in it cannot be practised, so it would sit
    // on the tick-box screen doing nothing. Say so rather than saving
    // a puzzle for later.
    const empty = lists.filter(function (list) {
      return list.words.length === 0;
    });

    const saved = SpellingStore.save(lists);

    if (!saved) {
      // Storage is switched off in this browser. Do NOT read the lists
      // back: that would hand over the built-in ones and wipe what was
      // just typed off the screen, on top of not having saved it.
      // What is on screen still works for this visit.
      say("Could not save. This browser has its storage switched off,"
        + " so the words will only last until the page is closed."
        + " Copy them out of the backup box below to keep them.");
      drawBackup();
      return;
    }

    lists = SpellingStore.load();
    if (!current()) openId = lists.length ? lists[0].id : null;

    drawListButtons();
    drawOpenList();
    drawBackup();

    if (empty.length) {
      say("Saved. " + quoted(empty) + " has no words in it yet, so it"
        + " cannot be picked for a round.");
    } else {
      say("Saved.");
    }
  }

  function quoted(someLists) {
    return someLists.map(function (list) {
      return "“" + list.name + "”";
    }).join(" and ");
  }

  function removeOpenList() {
    if (lists.length <= 1) return;
    const list = current();
    if (!list) return;

    if (!window.confirm("Delete “" + list.name + "”"
        + " and its " + list.words.length + " words?")) {
      return;
    }

    lists = lists.filter(function (other) { return other.id !== list.id; });
    openId = lists[0].id;

    SpellingStore.save(lists);
    drawListButtons();
    drawOpenList();
    drawBackup();
    say("Deleted “" + list.name + "”.");
  }

  /* ==========================================================
     THE BACKUP BOX
     ========================================================== */

  function drawBackup() {
    el("editor-backup-text").value = SpellingStore.toText(lists);
  }

  function loadFromText() {
    const text = el("editor-backup-text").value;
    const parsed = SpellingStore.fromText(text);

    if (!parsed.length) {
      say("Could not find any words in that text. Nothing was changed.");
      return;
    }

    if (!window.confirm("Replace all " + lists.length + " list(s) with the "
        + parsed.length + " in the box?")) {
      return;
    }

    lists = parsed;
    openId = lists[0].id;
    SpellingStore.save(lists);

    drawListButtons();
    drawOpenList();
    say("Loaded " + lists.length + " list(s).");
  }

  function startOver() {
    if (!window.confirm("Throw away your lists and go back to the ones"
        + " the game came with?")) {
      return;
    }
    lists = SpellingStore.reset();
    openId = lists.length ? lists[0].id : null;
    drawListButtons();
    drawOpenList();
    drawBackup();
    say("Back to the built-in lists.");
  }

  function say(message) {
    el("editor-status").innerHTML = message || "&nbsp;";
  }

  /* ==========================================================
     WIRING
     ========================================================== */

  el("editor-new-list").addEventListener("click", function () {
    gatherOpenList();
    addList();
    drawListButtons();
    drawOpenList();
    el("editor-name").focus();
    el("editor-name").select();
  });

  el("editor-save").addEventListener("click", save);
  el("editor-delete").addEventListener("click", removeOpenList);
  el("editor-load-text").addEventListener("click", loadFromText);
  el("editor-reset").addEventListener("click", startOver);

  // The read-back keeps up with the typing, so a mistake shows itself
  // while the cursor is still next to it.
  el("editor-words").addEventListener("input", drawPreview);
  el("editor-caps").addEventListener("change", drawPreview);

  // Renaming shows up in the list on the left straight away.
  el("editor-name").addEventListener("input", function () {
    const list = current();
    if (!list) return;
    list.name = el("editor-name").value.trim() || "Untitled";
    drawListButtons();
  });

  return {
    open: open,
    // Save on the way out, so "Done" never quietly loses the last
    // thing typed. main.js calls this from the Done button.
    close: function () { save(); }
  };

})();
