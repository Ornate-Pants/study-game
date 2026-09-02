/* ============================================================
   CONFIG - All the numbers you can change
   ============================================================

   This is YOUR file. Every number that changes how the
   game feels lives here, and nowhere else. Change a number,
   save the file, refresh the browser. That's it.

   Nothing here needs programming knowledge. Each line has a
   plain-English comment saying what the number does.
   ============================================================ */

const CONFIG = {

  APP_VERSION: "2.1",        // Which build of the game this is. It is written down
                             // HERE and nowhere else - the title screen reads it
                             // from this line, so bumping it here bumps it there.

  // --- Quiz scoring -----------------------------------------

  basePoints: 5,             // Points for getting an answer right on the first try.
                             // Same value no matter how many regions are picked.

  regionBonusPerRegion: 10,  // Bonus points for each region played, added ONCE at the
                             // very end (after the runner), not per question.
                             // 1 region = 10, 3 regions = 30, all 10 regions = 100.

  hintDelaySeconds: 8,       // How many seconds before the "Hint" button fades in. The
                             // Hint button appears in the capital and abbreviation games
                             // (Modes 4, 5, 6 and 8) and tells him WHICH state is lit up.
                             // Using it costs penaltyPoints, below - the same as a skip.

  skipDelaySeconds: 5,       // How many seconds before the "Skip" button fades in on a
                             // spelling question. Bigger = he has to try for longer
                             // before he is allowed to give up on a word.

  backspacesPerQuestion: 5,  // How many times Backspace may be pressed on ONE spelling
                             // question. When they run out the question is skipped for
                             // him. This stops a word being cracked by backspacing
                             // through the alphabet until the right letter appears.
                             // The dots left are shown in the bar at the top.

  penaltyPoints: 2,          // Points taken off a question whenever it needed a second
                             // chance. It is the SAME cost every way it can happen:
                             //   - used the Hint button
                             //   - skipped it, and got it when it came back
                             //   - got it right on the second pick
                             // A question is worth 5, so any of those leaves 3.
                             // Never goes below 0.

  revealSeconds: 2,          // How long the correct answer stays on screen after a miss.
                             // Used both when a multiple-choice question is missed twice
                             // and when a spelling word is skipped twice.

  feedbackSeconds: 1,        // How long the green "you got it!" flash stays up before the
                             // next question appears. Bigger = slower and calmer.

  tooltipSeconds: 4,         // How long the "remember to capitalize" reminder stays up.

  // --- Exam Mode -------------------------------------------
  //
  // Exam Mode is the tick-box on the Pick Your Regions screen. It can be
  // turned on for ANY of the ten games. While it is on there are no hints,
  // no second chances and no green or red at all until the round is over -
  // he types or picks an answer, presses Submit, and finds out at the end.
  // It is how you find out what he actually knows.

  examBonusMultiplier: 2,    // The region bonus is multiplied by this in an exam,
                             // because an exam is harder. 1 region normally earns
                             // 10 at the end; in an exam it earns 20. It is still
                             // added only ONCE, on the final score screen.

  zoomSmallStates: true,     // In the click-the-map games, show a second bigger map
                             // beside the first, holding the crowded north-eastern
                             // states: Rhode Island, Maryland, Delaware, Connecticut,
                             // Massachusetts and New Jersey. They are too small to
                             // click comfortably on the full map. Set to false to
                             // play without it.

  // --- Bonus round (the running game) -----------------------

  coinPoints: 5,             // Points for each coin grabbed in the running game.

  stunSeconds: 3,            // How long the player is frozen after hitting something.

  accelSeconds: 5,           // Seconds to speed up from standing still to top speed.

  runSpeedMax: 300,          // Top running speed, in pixels per second. Higher = faster.

  jumpVelocity: -550,        // Jump strength. More negative = jumps higher.
                             // This is the FULL jump, the one you get by holding
                             // the button down.

  jumpHoldSeconds: 0.22,     // Hold the jump button at least this long to get the
                             // full jump. Bigger = you have to hold it longer.

  jumpShortFactor: 0.40,     // Let go of the button straight away and you keep only
                             // this much of your upward speed - a small hop instead
                             // of a big jump. Smaller = tiny hops. 1 would turn the
                             // short jump off and make every jump the full height.

  gravity: 1200,             // How hard the player is pulled down. Higher = falls faster.

  runnerMinSeconds: 15,      // The shortest the bonus round can ever be, no matter how
                             // badly the quiz went. This changes the RUNNING TIME only.
                             // The final score still uses the real quiz points, so a
                             // short quiz never turns into free points.

  runnerTestSeconds: 60,     // The timer used by the "Test Bonus Round" button, which
                             // only appears when you add ?debug=1 to the web address.

  // --- What the running game builds ------------------------
  //
  // Careful with these four. They have to stay inside what a jump can
  // actually do, or the game will build a jump that cannot be made.
  // With the settings above, a jump goes about 126 pixels high and
  // about 275 pixels across at top speed.

  platformHeights: [60, 100], // How high the raised ledges sit. Both are under the
                              // 126-pixel jump height, with room to spare.

  pitWidthMin: 80,           // Narrowest hole in the ground.

  pitWidthMax: 150,          // Widest hole in the ground. Keep this well under 275,
                             // which is the furthest a jump goes at top speed.

  hazardGapMin: 420,         // Clear ground between one hazard and the next. This is
                             // the important one: after being stunned the player
                             // starts from a standstill, so he needs a long enough
                             // run-up to get going again before the next hazard.
                             // Going much below 400 starts to feel unfair.

  // --- How often the dangerous bits show up --------------
  //
  // Once hazardGapMin of clear ground has been laid, every stretch of
  // ground rolls the dice. Bigger numbers = a harder, busier game.
  // The two are tried in order: holes first, then cactuses.

  pitChance: 0.35,           // Chance a spot becomes a hole in the ground.

  obstacleChance: 0.45,      // Chance a spot becomes a cactus to jump over.
                             // Set both to 0 for a completely calm run.

  coinArcMin: 3,             // When coins come in an arc, the fewest it can hold.

  coinArcMax: 5,             // And the most.

  // --- High scores ------------------------------------------

  highScoreCount: 10,        // How many names to keep on the high score list.

  // --- General ----------------------------------------------

  soundOn: true,             // Start the game with sound on? true or false.

  debug: false               // Leave this false. Add ?debug=1 to the web address to
                             // turn on testing helpers just for that visit.
};
