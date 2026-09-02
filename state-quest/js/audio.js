/* ============================================================
   SOUND - The sound effects, and the mute button
   ============================================================

   There are NO sound files in this game. The five
   effects are made by the browser itself, from notes, at the
   moment they play.

   Why it was done that way: a page opened straight from a
   folder (file://) is fussy about loading its own media
   files, and five .ogg files would have been five more things
   to download, keep track of, and get wrong. Notes always
   work, weigh nothing, and can be tuned by editing numbers.

   TO CHANGE A SOUND, edit its recipe in SOUNDS below. Each
   line is one note:
       at    when it starts, in seconds from the beginning
       hz    how high the note is (bigger = higher)
       for   how long it lasts, in seconds
       vol   how loud, 0 to 1 (optional, defaults to 0.2)

   Some notes to borrow from:
       C 262   D 294   E 330   F 349   G 392
       A 440   B 494   C 523   E 659   G 784
   ============================================================ */

const Sound = (function () {

  /* ==========================================================
     THE FIVE SOUNDS
     ========================================================== */

  const SOUNDS = {

    // A right answer. Two notes going up: "well done".
    correct: {
      wave: "triangle",
      notes: [
        { at: 0.00, hz: 523, for: 0.11 },
        { at: 0.10, hz: 784, for: 0.18 }
      ]
    },

    // A wrong answer. ONE short, soft, low note.
    // The spec is firm about this: there are no lives and no
    // losing in this game, so it must never sound like a buzzer.
    wrong: {
      wave: "sine",
      notes: [
        { at: 0.00, hz: 196, for: 0.14, vol: 0.13 }
      ]
    },

    // Grabbing a coin. Very short and bright - this one plays
    // a lot, so anything longer would quickly get annoying.
    coin: {
      wave: "square",
      notes: [
        { at: 0.00, hz: 988, for: 0.05, vol: 0.10 },
        { at: 0.04, hz: 1319, for: 0.09, vol: 0.10 }
      ]
    },

    // Finishing a round. A little run up the scale.
    roundWin: {
      wave: "triangle",
      notes: [
        { at: 0.00, hz: 523, for: 0.11 },
        { at: 0.10, hz: 659, for: 0.11 },
        { at: 0.20, hz: 784, for: 0.11 },
        { at: 0.30, hz: 1047, for: 0.28 }
      ]
    },

    // Making the top ten. The biggest sound in the game.
    highScore: {
      wave: "triangle",
      notes: [
        { at: 0.00, hz: 523, for: 0.13 },
        { at: 0.12, hz: 659, for: 0.13 },
        { at: 0.24, hz: 784, for: 0.13 },
        { at: 0.36, hz: 1047, for: 0.16 },
        { at: 0.52, hz: 784, for: 0.10 },
        { at: 0.62, hz: 1047, for: 0.40 },
        // a second, higher note played at the same time makes the
        // last chord sound fuller rather than thin
        { at: 0.62, hz: 1319, for: 0.40, vol: 0.12 }
      ]
    }
  };

  /* ==========================================================
     MAKING THE NOISE
     ========================================================== */

  // The browser's sound engine. Made the first time it is needed,
  // never before: browsers refuse to start one until the person has
  // clicked something, and complain in the console if you try.
  let audio = null;

  function engine() {
    if (audio) return audio;

    const Maker = window.AudioContext || window.webkitAudioContext;
    if (!Maker) return null;          // very old browser, just stay silent

    try {
      audio = new Maker();
    } catch (e) {
      audio = null;
    }
    return audio;
  }

  // Is sound currently allowed? The game default, the mute button,
  // and the browser all get a say.
  let muted = Scores.loadMuted();

  function canPlay() {
    return CONFIG.soundOn && !muted;
  }

  // Play one note: a tone that fades in fast and out gently, so it
  // sounds like an instrument instead of a click.
  function playNote(box, note, wave, startAt) {
    const tone = box.createOscillator();
    const volume = box.createGain();

    tone.type = wave || "triangle";
    tone.frequency.value = note.hz;

    const loudest = (note.vol === undefined) ? 0.2 : note.vol;
    const begin = startAt + note.at;
    const end = begin + note.for;

    // Ramping the volume instead of switching it on and off is what
    // stops each note ending in an audible click.
    volume.gain.setValueAtTime(0.0001, begin);
    volume.gain.exponentialRampToValueAtTime(loudest, begin + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, end);

    tone.connect(volume);
    volume.connect(box.destination);

    tone.start(begin);
    tone.stop(end + 0.02);
  }

  // Play a sound by its friendly name, e.g. Sound.play("coin").
  // Does nothing at all if sound is off or the name is unknown.
  function play(name) {
    if (!canPlay()) return;

    const recipe = SOUNDS[name];
    if (!recipe) return;

    const box = engine();
    if (!box) return;

    try {
      // A browser may have parked the sound engine until the person
      // interacts with the page. Waking it is safe to ask for twice.
      if (box.state === "suspended") {
        const resumed = box.resume();
        if (resumed && typeof resumed.catch === "function") {
          resumed.catch(function () { /* nothing to be done */ });
        }
      }

      const now = box.currentTime + 0.02;
      recipe.notes.forEach(function (note) {
        playNote(box, note, recipe.wave, now);
      });
    } catch (e) {
      // A sound failing is never worth breaking the game over.
    }
  }

  function isMuted() {
    return muted;
  }

  // Flip sound on/off and remember the choice. Returns the new state.
  function toggleMute() {
    muted = !muted;
    Scores.saveMuted(muted);
    return muted;
  }

  // The first time the person clicks anything, quietly wake the sound
  // engine up. By the time a sound is actually wanted it is ready.
  document.addEventListener("pointerdown", function wake() {
    document.removeEventListener("pointerdown", wake);
    const box = engine();
    if (box && box.state === "suspended") {
      const resumed = box.resume();
      if (resumed && typeof resumed.catch === "function") {
        resumed.catch(function () { /* nothing to be done */ });
      }
    }
  });

  return {
    play: play,
    isMuted: isMuted,
    toggleMute: toggleMute,
    soundsInstalled: true,
    // Used by the tests to check the list of sounds is complete.
    names: Object.keys(SOUNDS)
  };

})();
