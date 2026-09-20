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
  //
  // EACH GAME KEEPS ITS OWN HIGH SCORES, in its own drawer. A spelling
  // round and a states round are not the same thing and were never
  // comparable, so one table holding both would only ever be confusing.
  //
  // The US game keeps the old drawer name on purpose: scores saved
  // before there was a second game are still in it, and renaming it
  // would throw them away for no reason at all.
  const KEY_NAME   = "stateQuest.lastName";
  const KEY_MUTED  = "stateQuest.muted";

  function scoresKey(gameId) {
    return (gameId === "states" || !gameId)
      ? "stateQuest.highScores"
      : "studyGame." + gameId + ".highScores";
  }

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

  // Returns one game's score entries, best first. Empty array if none.
  function loadScores(gameId) {
    const raw = readRaw(scoresKey(gameId));
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
  function saveScore(gameId, entry) {
    const list = loadScores(gameId);
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    const trimmed = list.slice(0, CONFIG.highScoreCount);
    writeRaw(scoresKey(gameId), JSON.stringify(trimmed));
    return trimmed;
  }

  // Would this score make that game's top 10? Used to decide on
  // name entry.
  function isHighScore(gameId, score) {
    const list = loadScores(gameId);
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

  // Wipes one game's saved scores. Only used by the debug tools.
  function clearScores(gameId) {
    try {
      window.localStorage.removeItem(scoresKey(gameId));
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
