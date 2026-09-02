/* ============================================================
   RUNNER - The bonus round (the running and jumping game)
   ============================================================

   The quiz earns seconds. This is what they are spent on.

   How it works, in plain terms:
     - The player runs to the right on his own. He speeds up
       from a standstill and then holds top speed.
     - One button jumps: Space, the Up arrow, or a click.
     - The ground is built as he goes and thrown away behind
       him, so it never runs out and never fills up memory.
     - Coins are points. Obstacles and holes are a 3 second
       freeze. The clock keeps running while he is frozen -
       that IS the penalty. Nothing is ever taken away.
     - At 0 seconds everything stops and the coins are handed
       back to main.js.

   IMPORTANT: this file must NOT start a Phaser game when it
   loads. Phaser takes over a chunk of the page and grabs the
   keyboard as soon as it starts, which would break the menu
   screens. The game only starts when main.js calls
   Runner.start().

   PLACEHOLDER ART ON PURPOSE (spec section 9). Everything is
   a coloured rectangle. The point of this phase is to get the
   jumping and the spacing feeling right FIRST. Kenney sprites
   go in during Phase 5. Art added early only makes it harder
   to tell whether the game feels good or just looks good.

   WHY THE NUMBERS IN config.js MATTER HERE:
   with the settings shipped today a jump goes about 126
   pixels high and about 275 pixels across at top speed. The
   ledges and the holes are sized against those two numbers.
   If you change gravity or jumpVelocity, re-read the comments
   next to platformHeights and pitWidthMax.
   ============================================================ */

const Runner = (function () {

  /* ==========================================================
     THE SHAPE OF THE WORLD
     These are drawing sizes, not game feel. The numbers that
     change how the game FEELS all live in data/config.js.
     ========================================================== */

  const VIEW_WIDTH = 900;      // how much of the world is on screen
  const VIEW_HEIGHT = 340;
  const GROUND_Y = 270;        // how far down the ground sits
  const GROUND_THICKNESS = 70;
  const PLAYER_SIZE = 34;
  const OBSTACLE_SIZE = 38;
  const COIN_SIZE = 18;
  const CHUNK_WIDTH = 300;     // ground is built in pieces this wide
  const OBSTACLE_CHUNK = 200;  // ...except a cactus, which needs less room
  const BUILD_AHEAD = 1600;    // build this far past the right edge
  const CLEAR_BEHIND = 700;    // throw away this far behind the left edge

  // How far forward things are drawn. The runner sits above the
  // scenery so he is never hidden behind a platform; the readouts sit
  // above everything.
  const PLAYER_DEPTH = 5;
  const TEXT_DEPTH = 10;

  // How tall the runner's PICTURE is drawn, as a multiple of his
  // collision square. He is a tall character in a square box, so the
  // picture is taller than the box he actually bumps into.
  const PLAYER_ART_HEIGHT = 1.75;

  // How far below the ground he has to be before it counts as having
  // fallen in a hole. Small enough that he is still on screen, big
  // enough that you see him drop in rather than blink across.
  const FALL_DETECT = 55;

  // After picking himself up, nothing can stun him again for this long.
  // This is a guard against a bug, not a dial to tune the game by, which
  // is why it lives here rather than in config.js.
  const STUN_GRACE_MS = 500;

  // Where a coin has to sit to be grabbed just by running into it.
  // Worked out from the player, not guessed: standing on the ground he
  // covers from GROUND_Y - PLAYER_SIZE down to GROUND_Y, so a coin has
  // to be inside that band. Put one a few pixels higher and it floats
  // over his head, uncollectable, which is exactly what happened the
  // first time this was built.
  const COIN_RUN_Y = GROUND_Y - PLAYER_SIZE / 2 - 8;

  const COLORS = {
    sky: 0xdff1fb,
    ground: 0x6a8f4a,
    groundTop: 0x86b45e,
    platform: 0x8d6e4a,
    player: 0x2563c9,
    playerStunned: 0xd64545,
    obstacle: 0x8a5a2b,
    coin: 0xf0a500
  };

  // Set once the Phaser game exists, so we never start two at once.
  let game = null;

  // Called when the timer runs out. main.js supplies it.
  let onFinish = null;

  // The one scene, kept here so the outside can peek at it for tests.
  let scene = null;

  /* ==========================================================
     PHASE 0 LEFTOVERS - still used by the startup self-check
     ========================================================== */

  function isPhaserLoaded() {
    return typeof window.Phaser !== "undefined";
  }

  function getVersion() {
    return isPhaserLoaded() ? window.Phaser.VERSION : null;
  }

  /* ==========================================================
     THE SCENE
     ========================================================== */

  // How many seconds the next run starts with. Handed to the scene
  // when it is created.
  let pendingSeconds = 0;

  // The scene is a class because that is what Phaser expects: methods
  // written on a plain object are NOT carried across onto the scene it
  // builds, so they go missing the moment one calls another.
  //
  // It is made here rather than at the top of the file so that a
  // missing Phaser gives a clear message instead of a crash on load.
  function makeSceneClass() {
    return class RunnerScene extends window.Phaser.Scene {

      constructor() {
        super("runner");

        // --- everything the scene keeps track of ---
        this.speed = 0;             // how fast he is running right now
        this.secondsLeft = 0;       // the countdown
        this.coins = 0;             // coins grabbed so far
        this.stunnedUntil = 0;      // clock time the freeze ends (0 = free)
        this.stunResumeX = 0;       // where to put him down when it ends
        this.stunReason = null;     // "crate" or "pit", for the debug readout
        this.graceUntil = 0;        // safe from hazards until this time
        this.builtTo = 0;           // world x the ground is built up to
        this.sinceHazard = 0;       // clear ground since the last hazard
        this.lastWasObstacle = false; // no hole straight after a crate
        this.over = false;          // timer finished, everything locked
        this.jumpStarted = 0;       // when the current jump began
        this.jumpCut = false;       // has this jump already been cut short?
        this.decor = [];
      }

      /* ---------- the artwork ----------

         THE RULE: pictures change how things LOOK and nothing about
         how they BEHAVE. Every moving part is still the same invisible
         box it always was, with the same size and the same physics; the
         picture is drawn on top and follows it around. That is why the
         jump height, the jump distance and the spacing between hazards
         come out identical with the art on or off - and the tests check
         exactly that.

         If assets/sprites/sprites-inline.js has not been built, there
         is no art and the game draws the plain coloured boxes instead.
         Both ways work.
      */
      preload() {
        this.artOn = (typeof SPRITE_ART !== "undefined") && !!SPRITE_ART;
        if (!this.artOn) return;

        Object.keys(SPRITE_ART).forEach(function (key) {
          this.load.image("art-" + key, SPRITE_ART[key]);
        }, this);
      }

      // Hide a physics box and draw a picture in its place. The picture
      // is tied to the box, so when the box goes the picture goes too.
      //
      // "align" says which edge of the picture lines up with the box:
      //   "bottom" - the picture stands ON the box (a cactus on the ground)
      //   "top"    - the picture hangs BELOW the box's top edge. Ledges
      //              need this: the box he lands on is a thin strip, and
      //              the picture is a chunky platform, so lining up their
      //              middles would draw the grass well above the level he
      //              actually stands on.
      //   "center" - middles match (a coin)
      dressUp(owner, key, targetWidth, align) {
        if (!this.artOn || !this.textures.exists("art-" + key)) return;

        owner.setVisible(false);

        const img = this.add.image(owner.x, owner.y, "art-" + key);
        img.setScale(targetWidth / img.width);

        if (align === "bottom") {
          img.setOrigin(0.5, 1);
          img.y = owner.y + owner.displayHeight / 2;
        } else if (align === "top") {
          img.setOrigin(0.5, 0);
          img.y = owner.y - owner.displayHeight / 2;
        } else {
          img.setOrigin(0.5, 0.5);
        }

        owner.art = img;
      }

      /* ---------- set up ---------- */
      create() {
        this.secondsLeft = pendingSeconds;
        const self = this;

        this.cameras.main.setBackgroundColor(COLORS.sky);

        // Groups. Ground and platforms are solid; coins are just
        // things to touch; obstacles are checked by overlap so a
        // crate never physically blocks him, it only stuns.
        this.solids = this.physics.add.staticGroup();
        this.coinGroup = this.physics.add.staticGroup();
        this.obstacleGroup = this.physics.add.staticGroup();

        // The player.
        this.player = this.add.rectangle(
          120, GROUND_Y - PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE, COLORS.player
        );
        this.physics.add.existing(this.player);
        this.player.body.setGravityY(CONFIG.gravity);
        this.player.body.setCollideWorldBounds(false);

        // The runner's picture. It is NOT the thing the game bumps into -
        // the invisible square above still is - it just follows along on
        // top. Scaled by height so that standing, jumping and hurt are
        // all the same size as each other.
        if (this.artOn && this.textures.exists("art-player")) {
          this.player.setVisible(false);
          this.playerArt = this.add.image(this.player.x, this.player.y, "art-player");
          this.playerArt.setOrigin(0.5, 1);

          // Drawn in FRONT of the scenery. The ledge pictures hang well
          // below the strip you actually stand on, and behind them the
          // runner disappears from view as he goes past.
          this.playerArt.setDepth(PLAYER_DEPTH);

          this.playerPose = "player";
          this.scalePlayerArt();
        }

        this.physics.add.collider(this.player, this.solids);
        this.physics.add.overlap(this.player, this.coinGroup, function (p, coin) {
          self.grabCoin(coin);
        });
        this.physics.add.overlap(this.player, this.obstacleGroup, function (p, crate) {
          // Where he gets put down is measured from THE CRATE, not from
          // the player. Measuring from the player looks like it works,
          // because landing on top of a crate leaves plenty of room -
          // but running into its left face stops him further back, and
          // the same sum then drops him exactly touching the right edge,
          // which instantly stuns him a second time.
          self.stun(crate.x + crate.displayWidth / 2 + PLAYER_SIZE, "crate");
        });

        // Camera follows him, sitting him a third from the left so
        // there is room to see what is coming.
        //
        // The bounds matter as much as the follow: they are exactly one
        // screen tall, which pins the camera's up-and-down scroll to
        // zero. Without them the camera centres itself on the player,
        // the whole world slides up, and a strip of empty sky appears
        // below the ground.
        this.cameras.main.setBounds(0, 0, 10000000, VIEW_HEIGHT);
        this.cameras.main.startFollow(this.player, true, 1, 0);
        this.cameras.main.setFollowOffset(-(VIEW_WIDTH / 2 - VIEW_WIDTH / 3), 0);

        // Build the first stretch of world. The very first run is
        // deliberately empty so nobody is stunned before they start.
        this.builtTo = 0;
        this.sinceHazard = -CONFIG.hazardGapMin;
        this.buildAhead();

        // --- the readouts, pinned to the screen not the world ---
        this.timerText = this.add.text(VIEW_WIDTH / 2, 16, "", {
          fontFamily: "Segoe UI, Verdana, sans-serif",
          fontSize: "44px", fontStyle: "bold", color: "#1a2238"
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(TEXT_DEPTH);

        this.coinText = this.add.text(16, 16, "", {
          fontFamily: "Segoe UI, Verdana, sans-serif",
          fontSize: "24px", fontStyle: "bold", color: "#8a6d00"
        }).setScrollFactor(0).setDepth(TEXT_DEPTH);

        this.refreshText();

        // --- jumping ---
        // Pressing starts the jump; LETTING GO cuts it short. That is what
        // gives a small hop and a big jump from the same button.
        this.input.keyboard.on("keydown-SPACE", function () { self.jump(); });
        this.input.keyboard.on("keydown-UP", function () { self.jump(); });
        this.input.on("pointerdown", function () { self.jump(); });

        this.input.keyboard.on("keyup-SPACE", function () { self.releaseJump(); });
        this.input.keyboard.on("keyup-UP", function () { self.releaseJump(); });
        this.input.on("pointerup", function () { self.releaseJump(); });

        // Space and the arrows scroll the page. Not while playing.
        this.input.keyboard.addCapture(["SPACE", "UP", "DOWN"]);
      }

      /* ---------- every frame ---------- */
      update(time, delta) {
        if (this.over) return;

        const step = delta / 1000;

        // The clock runs no matter what, including while frozen.
        this.secondsLeft -= step;
        if (this.secondsLeft <= 0) {
          this.secondsLeft = 0;
          this.finish();
          return;
        }

        if (this.stunnedUntil > 0) {
          this.tickStun(time);
        } else {
          this.run(step);
          this.checkFell();
        }

        this.buildAhead();
        this.clearBehind();
        this.updatePlayerArt();
        this.refreshText();
      }

      /* ---------- keeping the runner's picture with him ---------- */

      scalePlayerArt() {
        // Same height whichever pose is showing, so he never appears to
        // grow or shrink when he jumps.
        const wanted = PLAYER_SIZE * PLAYER_ART_HEIGHT;
        this.playerArt.setScale(wanted / this.playerArt.height);
      }

      updatePlayerArt() {
        if (!this.playerArt) return;

        // Stand on the bottom of the invisible square, so his feet meet
        // the ground rather than his middle.
        this.playerArt.x = this.player.x;
        this.playerArt.y = this.player.y + PLAYER_SIZE / 2;

        const onGround = this.player.body.blocked.down
          || this.player.body.touching.down;

        const pose = (this.stunnedUntil > 0) ? "playerHurt"
          : (onGround ? "player" : "playerJump");

        if (pose !== this.playerPose && this.textures.exists("art-" + pose)) {
          this.playerArt.setTexture("art-" + pose);
          this.playerPose = pose;
          this.scalePlayerArt();
        }
      }

      /* ---------- running ---------- */
      run(step) {
        // Speed up from a standstill, then hold. accelSeconds is how
        // long the whole climb takes.
        const perSecond = CONFIG.runSpeedMax / CONFIG.accelSeconds;
        this.speed = Math.min(CONFIG.runSpeedMax, this.speed + perSecond * step);
        this.player.body.setVelocityX(this.speed);
      }

      jump() {
        if (this.over || this.stunnedUntil > 0) return;

        // Only from solid ground. No double jumps (spec section 9).
        //
        // ONE EXCEPTION, AND IT IS DELIBERATE - LEAVE IT ALONE.
        // "touching.down" is set by overlap checks as well as by solid
        // ones, so a coin underfoot counts as ground and he can bounce
        // off it for a second jump. That was an accident; it was played,
        // enjoyed, and deliberately kept. It is an easter egg now.
        // Tightening this to blocked.down only would remove it.
        if (!this.player.body.blocked.down && !this.player.body.touching.down) return;

        this.player.body.setVelocityY(CONFIG.jumpVelocity);

        // Remember when this jump began, so letting go early can cut it
        // short - but only for the first jumpHoldSeconds. After that the
        // jump is "paid for" and releasing does nothing.
        this.jumpStarted = this.time.now;
        this.jumpCut = false;
      }

      // The button was let go. If he is still on the way up and let go
      // early, take most of the remaining upward speed away, which turns
      // a full jump into a hop. Let go late, or on the way down, and
      // nothing happens.
      releaseJump() {
        if (this.over || this.jumpCut || !this.jumpStarted) return;

        const held = (this.time.now - this.jumpStarted) / 1000;
        if (held >= CONFIG.jumpHoldSeconds) return;      // held long enough

        const rising = this.player.body.velocity.y < 0;
        if (!rising) return;                             // already falling

        this.player.body.setVelocityY(
          this.player.body.velocity.y * CONFIG.jumpShortFactor
        );
        this.jumpCut = true;
      }

      /* ---------- falling in a hole ---------- */
      checkFell() {
        // Caught soon after he drops in, so he is still on screen. It
        // used to wait until he was 120 below the ground - by which
        // point he had fallen out of sight and then froze there, which
        // is why a hole used to look like nothing happening at all.
        if (this.player.y < GROUND_Y + FALL_DETECT) return;

        // Exactly the same rules as hitting a crate: put down clear of
        // the hazard straight away, and flash there while the clock runs.
        this.stun(this.findGroundAfter(this.player.x) + PLAYER_SIZE, "pit");
      }

      // Where does solid ground start again, past this point?
      findGroundAfter(x) {
        let best = x + CONFIG.pitWidthMax + PLAYER_SIZE;
        const blocks = this.solids.getChildren();
        for (let i = 0; i < blocks.length; i++) {
          const left = blocks[i].x - blocks[i].displayWidth / 2;
          if (left > x && left < best) {
            best = left;
          }
        }
        return best;
      }

      /* ---------- the freeze ----------

         reason   "crate" or "pit", for the debug readout
         placeNow put him down at the far side immediately, instead of
                  freezing him where he is. Holes use this: freezing him
                  where he is means freezing him mid-air inside the hole,
                  where there is nothing to see.
      */
      stun(resumeX, reason) {
        if (this.stunnedUntil > 0 || this.over) return;

        // Just picked himself up? Then nothing can touch him for a
        // moment. The respawn is placed clear of the crate on its own,
        // so this is only a backstop - but it means no future change to
        // sizes or spacing can quietly bring the double-stun back.
        if (this.time.now < this.graceUntil) return;

        this.stunnedUntil = this.time.now + CONFIG.stunSeconds * 1000;
        this.stunResumeX = resumeX;
        this.stunReason = reason || "crate";
        this.speed = 0;

        this.player.body.setAllowGravity(false);
        this.player.fillColor = COLORS.playerStunned;

        // Put him where he is going to restart from RIGHT NOW, and let
        // him flash there. Flashing at the spot where he came to grief
        // and then jumping across when the freeze ends reads as two
        // separate events; this way a crate and a hole look the same.
        this.putDown(resumeX);

        Sound.play("wrong");
      }

      // Stand him on the ground at this spot.
      //
      // body.reset() rather than just setting x and y: the physics body
      // keeps its OWN copy of the position, so moving the drawn shape
      // alone leaves the two disagreeing. That is what left him sitting
      // a few pixels below the ground and then snapping up the moment he
      // started running again.
      putDown(x) {
        this.player.body.reset(x, GROUND_Y - PLAYER_SIZE / 2);
      }

      tickStun(time) {
        // Flash on and off so it is obvious he is not being ignored.
        const dim = Math.floor(time / 120) % 2 ? 0.35 : 1;
        (this.playerArt || this.player).setAlpha(dim);

        if (time < this.stunnedUntil) return;

        // He is already standing where he restarts from - stun() put him
        // there when the freeze began - so this just gives him his colour
        // and his weight back. He starts from a standstill; getting back
        // up to speed is the rest of the cost.
        this.stunnedUntil = 0;
        this.graceUntil = time + STUN_GRACE_MS;
        (this.playerArt || this.player).setAlpha(1);
        this.player.fillColor = COLORS.player;
        this.player.body.setAllowGravity(true);
        this.speed = 0;
      }

      /* ---------- coins ---------- */
      grabCoin(coin) {
        if (!coin.active) return;
        if (coin.art) coin.art.destroy();   // or the picture stays behind
        coin.destroy();
        this.coins++;
        Sound.play("coin");
      }

      /* ==========================================================
         BUILDING THE WORLD

         Ground is laid down left to right in pieces. The rule that
         keeps the game fair: after anything dangerous, a good long
         stretch of plain ground has to be laid before anything else
         dangerous is allowed. That stretch is what gives him room to
         get back up to speed after being frozen.
         ========================================================== */

      buildAhead() {
        const needTo = this.cameras.main.scrollX + VIEW_WIDTH + BUILD_AHEAD;
        while (this.builtTo < needTo) {
          this.buildChunk();
        }
      }

      buildChunk() {
        const x = this.builtTo;

        // Has enough clear ground been laid since the last hazard?
        //
        // The clear ground is measured in real pixels, not in whole
        // chunks. Counting chunks quietly doubled the real gap - set to
        // 420 it was actually delivering about 880, which is why the
        // game felt so empty.
        const canBeDangerous = this.sinceHazard >= CONFIG.hazardGapMin;

        // Only ever one hazard per stretch of ground. Holes are tried
        // first, then cactuses; both chances live in config.js.
        if (canBeDangerous && !this.lastWasObstacle
            && Math.random() < CONFIG.pitChance) {
          this.buildPit(x);
        } else if (canBeDangerous && Math.random() < CONFIG.obstacleChance) {
          this.buildObstacle(x);
        } else {
          this.buildPlain(x);
        }
      }

      // Lay plain ground until the full hazardGapMin has been covered,
      // in pieces small enough that the next hazard can start as soon as
      // the gap is met rather than at the next 300px boundary.
      shortestSafeRun() {
        return Math.max(60, CONFIG.hazardGapMin - this.sinceHazard);
      }

      buildPlain(x) {
        // While still short of the safe gap, lay exactly the ground that
        // is missing rather than a whole chunk. That way the next hazard
        // can arrive the moment it is fair, instead of waiting for the
        // next 300px boundary and doubling the real spacing.
        const width = (this.sinceHazard < CONFIG.hazardGapMin)
          ? Math.min(CHUNK_WIDTH, this.shortestSafeRun())
          : CHUNK_WIDTH;

        this.addGround(x, width);
        this.sinceHazard += width;
        this.lastWasObstacle = false;

        // Somewhere safe to put coins, and sometimes a ledge. Only on
        // the full-width pieces, so a short filler strip does not end up
        // with a ledge hanging off the end of it.
        if (width >= CHUNK_WIDTH) {
          if (Math.random() < 0.45) {
            this.addLedgeWithCoins(x + 60);
          } else if (Math.random() < 0.7) {
            // At running height, so these are collected just by running.
            this.addCoins(x + 70, COIN_RUN_Y);
          }
        }

        this.builtTo = x + width;
      }

      buildObstacle(x) {
        // A short piece of ground with the cactus on it. Deliberately
        // narrower than a normal chunk: a cactus only needs room for
        // itself, and laying a full 300 here pushed every hazard that
        // much further from the next one.
        this.addGround(x, OBSTACLE_CHUNK);

        const crateX = x + OBSTACLE_CHUNK / 2;
        const crate = this.add.rectangle(
          crateX, GROUND_Y - OBSTACLE_SIZE / 2,
          OBSTACLE_SIZE, OBSTACLE_SIZE, COLORS.obstacle
        );
        this.obstacleGroup.add(crate);
        crate.body.updateFromGameObject();

        // The cactus is drawn taller than the square he bumps into, so
        // it looks like a plant rather than a block. What stuns him is
        // still the square.
        this.dressUp(crate, "obstacle", OBSTACLE_SIZE * 1.25, "bottom");

        // A coin floating over it, as a reward for jumping.
        this.addCoins(crateX - COIN_SIZE / 2, GROUND_Y - 90, 1);

        this.sinceHazard = 0;
        this.lastWasObstacle = true;
        this.builtTo = x + OBSTACLE_CHUNK;
      }

      buildPit(x) {
        const width = CONFIG.pitWidthMin
          + Math.random() * (CONFIG.pitWidthMax - CONFIG.pitWidthMin);

        // Solid run-up, then the hole, then solid ground again. The
        // run-up matters: he has to be able to see it and be moving.
        const runUp = 110;
        this.addGround(x, runUp);
        // (the hole is simply ground that is never added)
        const after = CHUNK_WIDTH - runUp - width;
        this.addGround(x + runUp + width, Math.max(60, after));

        // A coin hanging over the middle of the hole.
        this.addCoins(x + runUp + width / 2, GROUND_Y - 70, 1);

        this.sinceHazard = 0;
        this.lastWasObstacle = false;
        this.builtTo = x + runUp + width + Math.max(60, after);
      }

      addGround(x, width) {
        if (width <= 0) return;
        const block = this.add.rectangle(
          x + width / 2, GROUND_Y + GROUND_THICKNESS / 2,
          width, GROUND_THICKNESS, COLORS.ground
        );
        this.solids.add(block);
        block.body.updateFromGameObject();

        // A lighter strip so the top edge reads clearly.
        const top = this.add.rectangle(
          x + width / 2, GROUND_Y + 3, width, 6, COLORS.groundTop
        );
        top.setDepth(1);
        this.decor = this.decor || [];
        this.decor.push(top);

        // A tuft of grass here and there so the ground is not a bare
        // green band. Decoration only - nothing bumps into these.
        if (this.artOn && width > 90 && Math.random() < 0.7) {
          const which = Math.random() < 0.5 ? "grass1" : "grass2";
          if (this.textures.exists("art-" + which)) {
            const tuft = this.add.image(
              x + 20 + Math.random() * (width - 40), GROUND_Y + 2, "art-" + which
            );
            tuft.setOrigin(0.5, 1);
            tuft.setScale(26 / tuft.height);
            this.decor.push(tuft);
          }
        }
      }

      // A raised ledge with an arc of coins over it. Both heights are
      // under a single jump, on purpose (spec section 9).
      addLedgeWithCoins(x) {
        const heights = CONFIG.platformHeights;
        const height = heights[Math.floor(Math.random() * heights.length)];
        const width = 150;

        const ledge = this.add.rectangle(
          x + width / 2, GROUND_Y - height, width, 14, COLORS.platform
        );
        this.solids.add(ledge);
        ledge.body.updateFromGameObject();

        // A ONE-WAY platform: solid to land on from above, but you pass
        // straight up through it from below. Without this you crack your
        // head on the underside and can never reach the ledge you are
        // standing beneath - which is exactly what happened in play.
        ledge.body.checkCollision.down = false;
        ledge.body.checkCollision.left = false;
        ledge.body.checkCollision.right = false;

        this.dressUp(ledge, "ledge", width, "top");

        // Standing on the ledge, he covers the same band as on the
        // ground, just raised by the ledge height.
        this.addCoins(x + 24, COIN_RUN_Y - height);
      }

      // A single coin, or an arc of them.
      addCoins(x, y, forceCount) {
        const count = forceCount || (Math.random() < 0.5
          ? 1
          : CONFIG.coinArcMin
            + Math.floor(Math.random() * (CONFIG.coinArcMax - CONFIG.coinArcMin + 1)));

        for (let i = 0; i < count; i++) {
          // An arc: the two end coins sit right at running height so
          // they are picked up just by running through, and the ones in
          // the middle curve up so they need a little hop. Dividing by
          // (count - 1) is what puts the ends at zero - divide by
          // (count + 1) instead and the whole arc floats out of reach.
          const lift = (count > 1)
            ? Math.sin(i / (count - 1) * Math.PI) * 34
            : 0;

          const coin = this.add.circle(
            x + i * 34, y - lift, COIN_SIZE / 2, COLORS.coin
          );
          this.coinGroup.add(coin);
          coin.body.updateFromGameObject();
          this.dressUp(coin, "coin", COIN_SIZE * 1.4, "center");
        }
      }

      // Throw away anything well behind him, so memory stays flat.
      clearBehind() {
        const edge = this.cameras.main.scrollX - CLEAR_BEHIND;

        [this.solids, this.coinGroup, this.obstacleGroup].forEach(function (group) {
          group.getChildren().slice().forEach(function (item) {
            if (item.x + item.displayWidth < edge) {
              if (item.art) item.art.destroy();   // the picture goes too
              item.destroy();
            }
          });
        });

        if (this.decor) {
          this.decor = this.decor.filter(function (item) {
            if (item.x + item.displayWidth < edge) {
              item.destroy();
              return false;
            }
            return true;
          });
        }
      }

      /* ---------- the readouts ---------- */
      refreshText() {
        this.timerText.setText(Math.ceil(this.secondsLeft));
        this.coinText.setText("Coins: " + this.coins
          + "   (" + (this.coins * CONFIG.coinPoints) + " points)");
      }

      /* ---------- the end ---------- */
      finish() {
        if (this.over) return;
        this.over = true;

        // Freeze everything and lock the score (spec section 9).
        this.player.body.setVelocity(0, 0);
        this.player.body.setAllowGravity(false);
        this.physics.pause();
        this.refreshText();

        this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, "Time!", {
          fontFamily: "Segoe UI, Verdana, sans-serif",
          fontSize: "60px", fontStyle: "bold", color: "#1b4a9b"
        }).setOrigin(0.5).setScrollFactor(0).setDepth(TEXT_DEPTH);

        Sound.play("roundWin");

        const earned = this.coins * CONFIG.coinPoints;
        const collected = this.coins;

        if (CONFIG.debug) {
          console.log("[runner] finished:", {
            coins: collected, coinPoints: earned
          });
        }

        // A moment to see "Time!" before the results screen.
        const self = this;
        this.time.delayedCall(900, function () {
          self.handBack(collected, earned);
        });
      }

      handBack(collected, earned) {
        const done = onFinish;
        stop();
        if (done) {
          done({ coins: collected, coinPoints: earned });
        }
      }
    };
  }

  /* ==========================================================
     STARTING AND STOPPING
     ========================================================== */

  // startSeconds comes from the quiz points: 1 point = 1 second.
  // whenFinished gets { coins, coinPoints } when the timer runs out.
  function start(startSeconds, whenFinished) {
    stop();   // never two games at once

    if (!isPhaserLoaded()) {
      console.error("[runner] Phaser did not load. Check lib/phaser.min.js.");
      return null;
    }

    // However badly the quiz went, the bonus round is worth playing.
    // This changes the TIME only - the score still uses the real points.
    const seconds = Math.max(CONFIG.runnerMinSeconds, Math.round(startSeconds) || 0);

    onFinish = whenFinished || null;
    pendingSeconds = seconds;

    const RunnerScene = makeSceneClass();
    scene = new RunnerScene();

    game = new window.Phaser.Game({
      type: window.Phaser.AUTO,
      parent: "runner-container",
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      // Phaser prints a banner and starts an audio engine unless told
      // not to. The game has its own Sound module, and a clean console
      // is how every phase gets tested.
      banner: false,
      audio: { noAudio: true },
      scale: {
        mode: window.Phaser.Scale.FIT,
        autoCenter: window.Phaser.Scale.CENTER_BOTH
      },
      physics: {
        default: "arcade",
        arcade: { gravity: { y: 0 }, debug: false }
      },
      scene: scene
    });

    if (CONFIG.debug) {
      console.log("[runner] started with", seconds, "seconds",
        "(quiz points were " + startSeconds + ")");
    }

    return game;
  }

  // Shut the game down and give the page back.
  function stop() {
    if (game) {
      game.destroy(true);
      game = null;
    }
    scene = null;
  }

  // Debug only: end the round early, keeping whatever was collected.
  function endNow() {
    if (scene && !scene.over) {
      scene.secondsLeft = 0;
      scene.finish();
    }
  }

  // A read-only peek for the test suite. Canvas physics cannot be
  // checked by reading the page, so the tests sample this instead.
  function debugState() {
    if (!scene || !scene.player) return null;
    return {
      x: scene.player.x,
      y: scene.player.y,
      speed: scene.speed,
      onGround: !!(scene.player.body
        && (scene.player.body.blocked.down || scene.player.body.touching.down)),
      secondsLeft: scene.secondsLeft,
      coins: scene.coins,
      stunned: scene.stunnedUntil > 0,
      stunReason: scene.stunReason,
      over: scene.over,
      builtTo: scene.builtTo
    };
  }

  // Also read-only: what the generator has actually laid down, so the
  // tests can prove no hole is too wide and no two hazards too close.
  function debugWorld() {
    if (!scene || !scene.solids) return null;

    function boxes(group) {
      return group.getChildren().map(function (item) {
        return {
          left: item.x - item.displayWidth / 2,
          right: item.x + item.displayWidth / 2,
          top: item.y - item.displayHeight / 2
        };
      }).sort(function (a, b) { return a.left - b.left; });
    }

    // Are the raised ledges one-way? He must be able to jump up
    // THROUGH one and land on top, rather than banging his head.
    const ledgeBodies = scene.solids.getChildren().filter(function (item) {
      return item.y < GROUND_Y - 1;
    });

    const oneWay = ledgeBodies.every(function (item) {
      return item.body && item.body.checkCollision.down === false
        && item.body.checkCollision.up === true;
    });

    return {
      ground: boxes(scene.solids).filter(function (b) {
        return b.top >= GROUND_Y - 1;    // real ground, not the ledges
      }),
      ledges: boxes(scene.solids).filter(function (b) {
        return b.top < GROUND_Y - 1;
      }),
      obstacles: boxes(scene.obstacleGroup),
      groundY: GROUND_Y,
      ledgesAreOneWay: ledgeBodies.length > 0 && oneWay,
      ledgeCount: ledgeBodies.length,
      // The runner must be drawn in FRONT of the scenery, or he vanishes
      // behind a platform as he runs past it.
      playerDepth: scene.playerArt ? scene.playerArt.depth : null,
      ledgeArtDepth: (ledgeBodies[0] && ledgeBodies[0].art)
        ? ledgeBodies[0].art.depth : null
    };
  }

  // Read-only: did the pictures actually make it into the drawing
  // engine? This is the check that proves the inlined art works from
  // file://, which loose .png files would not.
  function debugTextures() {
    if (!scene || !scene.textures) return null;

    const wanted = (typeof SPRITE_ART !== "undefined" && SPRITE_ART)
      ? Object.keys(SPRITE_ART) : [];

    const missing = wanted.filter(function (key) {
      return !scene.textures.exists("art-" + key);
    });

    return {
      artOn: !!scene.artOn,
      loaded: wanted.length - missing.length,
      missing: missing
    };
  }

  // Let the tests build a lot of world quickly without playing it.
  function debugBuild(times) {
    if (!scene) return;
    for (let i = 0; i < times; i++) {
      scene.buildChunk();
    }
  }

  return {
    isPhaserLoaded: isPhaserLoaded,
    getVersion: getVersion,
    start: start,
    stop: stop,
    endNow: endNow,
    isRunning: function () { return !!game; },
    debugState: debugState,
    debugWorld: debugWorld,
    debugTextures: debugTextures,
    debugBuild: debugBuild
  };

})();
