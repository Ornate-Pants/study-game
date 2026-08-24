MAP ASSET  --  done, added in Phase 1

What is here:
  us-states.svg          the blank US map. Every state is its own
                         shape, and each shape's id is the state's
                         2-letter code (ME, NH, VT, ...). Alaska and
                         Hawaii sit in the lower-left as insets.
                         This is the readable copy, kept so the map
                         can be looked at or rebuilt later.

  us-states-inline.js    the same map wrapped in a JavaScript file.
                         THIS is the one the game actually loads.

Why the second file exists:
  A page opened straight from a folder (file://) is not allowed to
  read its own .svg file with code. Wrapping the map in a .js file
  gets around that, the same trick used for data/states.js.

Where the map came from:
  Wikimedia Commons, "Blank US Map (states only)" by Heitordp.
  CC0 (public domain) - free to use, and no credit is required.
  Nothing needs to go on an About screen.

DO NOT hand-edit these two files.
  They are made by tools/build-map.py. That tool downloads the
  original, cleans it up, checks all 50 states against
  data/states.js, and refuses to write anything if one is wrong.
  To rebuild:   python tools/build-map.py
  See the top of that file for what it changes and why.

To check the map at any time:
  Double-click map-test.html. It reports whether the data and the
  map still agree, lights up all 50 states one at a time, and
  colors each region on demand. Use it after any edit to
  data/states.js or to the map itself.

A note on Washington DC:
  DC is drawn on the map, because a US map without it looks wrong.
  It is never a quiz question, never colored in, and clicks pass
  straight through it. It is not in data/states.js and does not
  need to be.
