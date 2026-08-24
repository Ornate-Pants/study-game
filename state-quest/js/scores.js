/* ============================================================
   SCORES - Saving high scores and settings in the browser
   ============================================================

   The browser has a small storage box called "localStorage"
   that remembers things after you close the window. That is
   where high scores, the last player name, and the sound
   on/off setting are kept.

   Why every function here uses try/catch: some browsers turn
   off storage (private mode, strict privacy settings). If that
   happens we quietly carry on with no saved scores instead of
   crashing the whole game.
   ============================================================ */

const Scores = (function () {

  // The names of the "drawers" in the browser's storage box.
  const KEY_SCORES = "stateQuest.highScores";
  const KEY_NAME   = "stateQuest.lastName";
  const KEY_MUTED  = "stateQuest.muted";

  /* --- Low-level read/write, safe if storage is unavailable --- */

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* --- High score list --- */

  // Returns an array of score entries, best first. Empty array if none.
  function loadScores() {
    const raw = readRaw(KEY_SCORES);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // Saved data was damaged somehow. Start fresh rather than crash.
      return [];
    }
  }

  // Adds one score, keeps only the best CONFIG.highScoreCount, saves.
  // entry = { name, score, mode, regions, date }
  function saveScore(entry) {
    const list = loadScores();
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    const trimmed = list.slice(0, CONFIG.highScoreCount);
    writeRaw(KEY_SCORES, JSON.stringify(trimmed));
    return trimmed;
  }

  // Would this score make the top 10? Used to decide on name entry.
  function isHighScore(score) {
    const list = loadScores();
    if (list.length < CONFIG.highScoreCount) return true;
    return score > list[list.length - 1].score;
  }

  /* --- Last used player name (pre-fills the name box) --- */

  function loadLastName() {
    return readRaw(KEY_NAME) || "";
  }

  function saveLastName(name) {
    writeRaw(KEY_NAME, name);
  }

  /* --- Sound on/off, remembered between visits --- */

  function loadMuted() {
    return readRaw(KEY_MUTED) === "true";
  }

  function saveMuted(muted) {
    writeRaw(KEY_MUTED, muted ? "true" : "false");
  }

  // Wipes saved scores. Only used by the debug tools for now.
  function clearScores() {
    try {
      window.localStorage.removeItem(KEY_SCORES);
    } catch (e) { /* nothing to do */ }
  }

  // These are the functions the rest of the game is allowed to use.
  return {
    loadScores: loadScores,
    saveScore: saveScore,
    isHighScore: isHighScore,
    loadLastName: loadLastName,
    saveLastName: saveLastName,
    loadMuted: loadMuted,
    saveMuted: saveMuted,
    clearScores: clearScores
  };

})();
