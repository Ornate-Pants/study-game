SPRITES  --  done, added in Phase 5

What is here:
  sprites-inline.js   every picture the running game uses, written
                      into one JavaScript file. THIS is the file the
                      game loads. Do not hand-edit it.

Why the pictures are inside a .js file:
  A page opened straight from a folder (file://) cannot load its
  own .png files into the game's drawing engine. The browser
  treats them as coming from a stranger and blocks them. Written
  into a .js file they are part of the page, so they always work.
  Same trick as the map and the state list.

  This one matters more than it sounds. Loose .png files LOOK
  like they work when tested through developer tools, and then
  fail the moment you double-click index.html.

Where the art comes from:
  Kenney's "Jumper Pack" (kenney.nl), CC0 / public domain.
  Free to use, no credit required. The zip it came from is in
  tools/, and tools/zip-contents.txt lists everything inside it.

  Pictures in use:
    bunny1_stand / bunny1_jump / bunny1_hurt   the runner
    gold_1                                      coins
    cactus                                      the thing to jump
    ground_grass_small                          the raised ledges
    grass1 / grass2                             grass on the ground

  The flat green ground is NOT a picture. Jumper Pack is a
  jumping-upward game, so its ground pieces are rounded floating
  platforms; laid end to end they show seams. The ground is drawn
  as a plain green band instead, with grass tufts scattered on it.

TO CHANGE THE ART:
  Put a different pack's .zip in tools/ and run:
      python tools/build-assets.py
  It prints which picture it picked for each job, and stops with
  the zip's contents listed if it cannot find something. The list
  of what to look for is at the top of that file.

IF sprites-inline.js IS MISSING OR EMPTY:
  The game still runs. The running game falls back to plain
  coloured boxes, exactly as it looked before Phase 5. Nothing
  breaks, it just looks plainer.
