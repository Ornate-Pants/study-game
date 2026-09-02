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

  // "RI" -> the copies of Rhode Island living in the zoom panel.
  // A state and its copies must always be wearing the same color, or
  // the panel would sit there showing a stale answer. That is why
  // setLook() and clearAll() write to both.
  const twins = {};

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
      wear(abbr, baseClass[abbr]);
    });
    hideRing();
  }

  // Dress a state, and its copies in the zoom panel, in the same class.
  function wear(abbr, className) {
    if (shapes[abbr]) {
      shapes[abbr].setAttribute("class", className);
    }
    (twins[abbr] || []).forEach(function (twin) {
      twin.setAttribute("class", className);
    });
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
    wear(abbr, baseClass[abbr] + " " + look);
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
     THE ZOOM PANEL - the crowded north-east, made big enough

     Rhode Island is about 14 map units across. On the full map
     that is a target the size of a pea, and the Gate 6 play
     test said so: findable, but not clickable without care.

     The panel is a SECOND, SMALLER MAP shown beside the first.
     It holds copies of the same shapes, seen through a viewBox
     that covers only the north-east corner - so the browser
     does the enlarging and there is no zoom arithmetic here at
     all. A copy is an ordinary state shape with an ordinary
     data-abbr, which is why clicking one needs no new code:
     the click handler below cannot tell the two apart, and
     does not need to.

     The copies lose their id. An id may be used once per page,
     and two shapes both called "RI" is exactly the trouble
     that the one-map rule at the top of this file avoids.
     ========================================================== */

  // The six that the play test found too small. These are what the
  // panel is sized around.
  const ZOOM_STATES = ["RI", "MD", "DE", "CT", "MA", "NJ"];

  // Their neighbours. Drawn so the six sit in a place a kid recognises
  // instead of floating in space. Whatever falls outside the panel is
  // simply cut off by the viewBox.
  const ZOOM_NEIGHBOURS = ["NY", "PA", "VA", "WV", "NH", "VT", "ME", "NC", "DC"];

  // Breathing room around the six, in map units.
  const ZOOM_MARGIN = 14;

  // Used only if the browser cannot measure the map (which it will not
  // do while the map is off screen). Measured from this map once; if the
  // map is ever rebuilt these are the numbers to check.
  const ZOOM_BOX_FALLBACK = { x: 745, y: 131, w: 171, h: 151 };

  // The panel's <svg>, built the first time it is asked for.
  let zoom = null;

  // How much of the map the panel shows: the six states, plus a margin.
  function zoomBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

    ZOOM_STATES.forEach(function (abbr) {
      const shape = shapes[abbr];
      if (!shape) return;

      // getBBox only answers while the map is really on screen.
      let box;
      try {
        box = shape.getBBox();
      } catch (e) {
        return;
      }
      if (!box || !box.width) return;

      x0 = Math.min(x0, box.x);
      y0 = Math.min(y0, box.y);
      x1 = Math.max(x1, box.x + box.width);
      y1 = Math.max(y1, box.y + box.height);
    });

    if (!isFinite(x0) || x1 <= x0) return ZOOM_BOX_FALLBACK;

    return {
      x: x0 - ZOOM_MARGIN,
      y: y0 - ZOOM_MARGIN,
      w: (x1 - x0) + ZOOM_MARGIN * 2,
      h: (y1 - y0) + ZOOM_MARGIN * 2
    };
  }

  function buildZoom() {
    if (zoom) return zoom;

    const element = build();
    if (!element) return null;

    const SVG_NS = "http://www.w3.org/2000/svg";
    const box = zoomBox();
    const shown = ZOOM_STATES.concat(ZOOM_NEIGHBOURS);

    zoom = document.createElementNS(SVG_NS, "svg");
    // It carries the class "us-map" so every color, every region tint
    // and the hover outline all work in here with no extra styling.
    zoom.setAttribute("class", "us-map us-map-zoom");
    zoom.setAttribute("viewBox", box.x + " " + box.y + " " + box.w + " " + box.h);
    zoom.setAttribute("role", "img");
    zoom.setAttribute("aria-label", "Northeast Corridor - Zoomed in");

    // The neighbours go in a group of their own, which the stylesheet
    // draws a shade paler. Without it the panel is one flat sheet of
    // grey and there is nothing to say which states it is here for.
    // They are still perfectly clickable - paler, not switched off.
    const backdrop = document.createElementNS(SVG_NS, "g");
    backdrop.setAttribute("class", "us-map-backdrop");
    zoom.appendChild(backdrop);

    shown.forEach(function (abbr) {
      const original = shapes[abbr];
      if (!original) return;

      const twin = original.cloneNode(true);
      twin.removeAttribute("id");

      if (ZOOM_STATES.indexOf(abbr) === -1) {
        backdrop.appendChild(twin);
      } else {
        zoom.appendChild(twin);
      }

      twins[abbr] = (twins[abbr] || []).concat([twin]);
    });

    // The white lines between the states. Without them the panel is one
    // grey blob, because every unpicked state is the same color. Each
    // line is named after the two states it runs between ("ct-ma"), so
    // only the ones in view are worth copying.
    const borders = element.querySelector(".us-map-borders");
    if (borders) {
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "us-map-borders");
      group.setAttribute("fill", "none");

      const lower = shown.map(function (a) { return a.toLowerCase(); });
      const lines = borders.querySelectorAll("path");

      for (let i = 0; i < lines.length; i++) {
        const between = (lines[i].getAttribute("class") || "").split("-");
        const touches = between.some(function (a) {
          return lower.indexOf(a) !== -1;
        });
        if (touches) {
          group.appendChild(lines[i].cloneNode(true));
        }
      }
      zoom.appendChild(group);
    }

    // The dot marking Washington DC is deliberately NOT copied. It is
    // drawn at map scale, so blown up this far it becomes a big white
    // ring sitting on Maryland, and it reads as a hole in the map.

    // Clicks here go to the same place clicks on the big map go.
    zoom.addEventListener("click", onMapClick);
    zoom.classList.toggle("is-clickable", !!clickHandler);

    if (CONFIG.debug) {
      console.log("[map] zoom panel built, showing", box);
    }

    return zoom;
  }

  // Put the panel on screen, inside the given box. Off by default: it
  // is a click-mode aid, and CONFIG.zoomSmallStates turns it off.
  function showZoom(container) {
    if (!container || !CONFIG.zoomSmallStates) return null;

    const panel = buildZoom();
    if (!panel) return null;

    container.appendChild(panel);
    container.hidden = false;
    return panel;
  }

  // Take it off the page entirely, rather than just hiding it. It holds
  // a second Rhode Island, and anything looking the page over for states
  // should find exactly the fifty on the map.
  function hideZoom() {
    if (!zoom || !zoom.parentNode) return;
    const holder = zoom.parentNode;
    holder.removeChild(zoom);
    holder.hidden = true;
  }

  /* ==========================================================
     CLICKING THE MAP (Modes 9 and 10)

     There is ONE listener, put on the whole map, not fifty
     listeners put on fifty states. A click anywhere in the map
     is traced back to whichever state shape it landed on.

     It has to be switchable, because the map is MOVED from
     screen to screen. A listener left switched on would follow
     the map onto Pick Your Regions and start answering
     questions that are not being asked.
     ========================================================== */

  // Who to tell when a state is clicked, or null for "nobody,
  // clicking does nothing".
  let clickHandler = null;

  // Put on the map once, then left alone. It does nothing at all
  // while clickHandler is null.
  let listening = false;

  function onMapClick(event) {
    if (!clickHandler) return;

    // The click may have landed on something inside the shape, so
    // walk up until a state is found.
    const shape = event.target.closest("[data-abbr]");
    if (!shape) return;

    const abbr = shape.getAttribute("data-abbr");

    // DC is drawn but is not one of the 50, and is click-through in
    // the CSS anyway. This is the belt to that pair of braces.
    if (abbrs.indexOf(abbr) === -1) return;

    clickHandler(abbr);
  }

  // Turn clicking on (with someone to tell) or off.
  // The class is what the stylesheet uses to show a pointer and a
  // hover outline, so the map only LOOKS clickable when it is.
  function setClickable(enabled, callback) {
    const element = build();
    if (!element) return;

    if (!listening) {
      element.addEventListener("click", onMapClick);
      listening = true;
    }

    clickHandler = enabled ? (callback || null) : null;
    element.classList.toggle("is-clickable", !!clickHandler);

    // The zoom panel is part of the same answer sheet, so it goes live
    // and dead at exactly the same moment.
    if (zoom) {
      zoom.classList.toggle("is-clickable", !!clickHandler);
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
    setClickable: setClickable,
    showZoom: showZoom,
    hideZoom: hideZoom,
    getShape: getShape,
    forEachState: forEachState,
    getAbbrs: getAbbrs
  };

})();
