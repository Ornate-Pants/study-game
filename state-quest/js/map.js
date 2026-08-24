/* ============================================================
   US MAP - the only file that touches the map picture
   ============================================================

   Everything the game does to the map goes through here:
   coloring a state in, tinting a whole region, clearing it
   again, and (from Phase 6) knowing which state was clicked.

   Two ideas worth knowing before reading the code:

   1. THERE IS ONLY ONE MAP. It is built once, then MOVED from
      screen to screen. It is not copied. Two copies on the
      page at the same time would mean two shapes both called
      "ME", and the browser would not know which one anybody
      meant. Only one screen is ever visible, so one map is
      plenty.

   2. COLORS ARE CLASSES, NEVER PAINTED ON DIRECTLY. To color
      Maine, this file puts a class name on Maine's shape and
      css/style.css decides what that class looks like. That
      way every color in the game lives in the stylesheet
      where Scott can find it, and not scattered through the
      code.

   The name is USMap, not Map, because "Map" already means
   something else in JavaScript and taking that name would
   quietly break other code on the page.
   ============================================================ */

const USMap = (function () {

  // How big the "look here" ring is, in map units.
  //   MIN - Rhode Island is only about 8 units across, so without a
  //         floor the ring around it would be as easy to miss as the
  //         state itself.
  //   MAX - without a ceiling, the ring around Texas would loop around
  //         half the country and point at nothing in particular.
  const RING_MIN_RADIUS = 26;
  const RING_MAX_RADIUS = 70;
  const RING_GROWTH = 0.8;   // how far the ring sits outside the state

  // The <svg> element, built the first time it is needed.
  let svg = null;

  // The circle drawn around the state being asked about.
  let ring = null;

  // Quick lookup: "ME" -> that state's <path>. Filled in by build().
  const shapes = {};

  // The class each shape starts life with, so clearing is just
  // "put it back the way it was".
  const baseClass = {};

  // The 50 codes, in the order they appear in data/states.js.
  const abbrs = [];

  /* ==========================================================
     BUILDING THE MAP (happens once)
     ========================================================== */

  function build() {
    if (svg) return svg;

    // US_MAP_SVG comes from assets/map/us-states-inline.js.
    if (typeof US_MAP_SVG === "undefined") {
      console.error("[map] us-states-inline.js did not load. "
        + "Check the <script> tags in index.html.");
      return null;
    }

    // The browser turns the map text into real shapes for us.
    const holder = document.createElement("div");
    holder.innerHTML = US_MAP_SVG;
    svg = holder.querySelector("svg");

    if (!svg) {
      console.error("[map] the map text did not contain an <svg>.");
      return null;
    }

    // Remember every shape by its 2-letter code. Washington DC is in
    // the map but is not one of the 50 states, so it is remembered for
    // drawing but kept out of the list the quiz picks questions from.
    const found = svg.querySelectorAll("[data-abbr]");
    for (let i = 0; i < found.length; i++) {
      const shape = found[i];
      const abbr = shape.getAttribute("data-abbr");

      shapes[abbr] = shape;
      baseClass[abbr] = shape.getAttribute("class") || "";

      if (abbr !== "DC") {
        abbrs.push(abbr);
      }
    }

    if (CONFIG.debug) {
      console.log("[map] built with", abbrs.length, "states (plus DC).");
    }

    return svg;
  }

  /* ==========================================================
     PUTTING THE MAP ON A SCREEN
     ========================================================== */

  // Move the map inside the given box. Call this whenever a screen
  // wants to show it; the map leaves whatever screen it was on.
  function mountInto(container) {
    const element = build();
    if (!element || !container) return null;

    container.appendChild(element);   // appendChild MOVES it, not copies
    return element;
  }

  // True if the map is currently sitting inside this box.
  function isMountedIn(container) {
    return !!(svg && container && container.contains(svg));
  }

  /* ==========================================================
     COLORING
     ========================================================== */

  // One state's shape, or null if that code is not on the map.
  function getShape(abbr) {
    build();
    return shapes[abbr] || null;
  }

  // Put every state back to its plain, uncolored look.
  function clearAll() {
    build();
    Object.keys(shapes).forEach(function (abbr) {
      shapes[abbr].setAttribute("class", baseClass[abbr]);
    });
    hideRing();
  }

  /* ==========================================================
     THE "LOOK HERE" RING

     Coloring a state gold is not enough on its own. Rhode Island
     and Delaware are so small that a colored-in Rhode Island is
     a speck, and a kid cannot tell which state is being asked
     about. So a ring is drawn around whichever state is lit, big
     enough to spot from across the room even when the state
     underneath it is tiny.
     ========================================================== */

  function makeRing() {
    if (ring) return ring;

    // SVG shapes have to be made with the SVG namespace, not the
    // plain createElement used for normal page elements.
    ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("class", "us-map-ring");
    hideRing();

    // Added last so it draws on top of the states and the borders.
    svg.appendChild(ring);
    return ring;
  }

  function showRing(abbr) {
    const shape = shapes[abbr];
    if (!shape) return;

    const circle = makeRing();

    // getBBox asks the browser "how big is this shape, really?".
    // It only answers when the map is actually on screen, so if the
    // answer is nonsense the ring is simply left off.
    let box;
    try {
      box = shape.getBBox();
    } catch (e) {
      hideRing();
      return;
    }

    if (!box || box.width === 0 || box.height === 0) {
      hideRing();
      return;
    }

    const radius = Math.min(
      RING_MAX_RADIUS,
      Math.max(RING_MIN_RADIUS, Math.max(box.width, box.height) * RING_GROWTH)
    );

    circle.setAttribute("cx", box.x + box.width / 2);
    circle.setAttribute("cy", box.y + box.height / 2);
    circle.setAttribute("r", radius);
    circle.removeAttribute("hidden");
    circle.style.display = "";
  }

  function hideRing() {
    if (ring) {
      ring.style.display = "none";
    }
  }

  // Add a look to one state, keeping whatever it already had.
  // Example: setLook("ME", "is-highlight")
  function setLook(abbr, look) {
    const shape = getShape(abbr);
    if (!shape) {
      console.warn("[map] no state on the map called:", abbr);
      return;
    }
    shape.setAttribute("class", baseClass[abbr] + " " + look);
  }

  // The quiz's "THIS is the state we are asking about" color, plus
  // the ring around it. Clears any earlier highlight first, so only
  // one state is ever lit.
  function highlight(abbr) {
    clearAll();
    setLook(abbr, "is-highlight");
    showRing(abbr);
  }

  // Tint a group of states in one region's color, 1 through 10.
  // Used by the Pick Your Regions screen.
  function setRegionTint(abbrList, regionNumber) {
    for (let i = 0; i < abbrList.length; i++) {
      setLook(abbrList[i], "region-" + regionNumber);
    }
  }

  /* ==========================================================
     WALKING THE STATES (used by map-test.html)
     ========================================================== */

  // Run a function once for each of the 50 states. Skips DC.
  function forEachState(callback) {
    build();
    abbrs.forEach(function (abbr) {
      callback(shapes[abbr], abbr);
    });
  }

  // A plain list of the 50 codes the map knows about.
  function getAbbrs() {
    build();
    return abbrs.slice();
  }

  return {
    mountInto: mountInto,
    isMountedIn: isMountedIn,
    clearAll: clearAll,
    highlight: highlight,
    showRing: showRing,
    hideRing: hideRing,
    setLook: setLook,
    setRegionTint: setRegionTint,
    getShape: getShape,
    forEachState: forEachState,
    getAbbrs: getAbbrs
  };

})();
