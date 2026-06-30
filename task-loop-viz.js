// task-loop-viz.js — animated task_write lifecycle as a client↔agent exchange.
// Left column: the agent (task list panel). Right column: the client (orchestrator).
// Messages fly between them as arrows. The task list updates on the agent side
// as the state machine on the client side drives the loop.
// Vanilla JS + SVG, no dependencies. Starts when scrolled into view.
(function () {
  "use strict";

  var container = document.getElementById("task-loop-viz");
  if (!container) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ns = "http://www.w3.org/2000/svg";

  var TASKS = [
    "Explore codebase",
    "Write tests",
    "Fix the bug",
    "Update docs"
  ];

  // Layout: two columns with a lane between them for arrows
  var W = 560, H = 380;
  var AGENT_X = 16, AGENT_W = 230;
  var CLIENT_X = 314, CLIENT_W = 230;
  var LANE_L = AGENT_X + AGENT_W;
  var LANE_R = CLIENT_X;
  var LANE_MID = (LANE_L + LANE_R) / 2;
  var TOP_Y = 30;
  var ROW_H = 34;
  var PAD = 10;
  var DOT_CX = AGENT_X + PAD + 8;
  var DOT_R = 4;
  var TEXT_X = DOT_CX + 16;
  var STATUS_X = AGENT_X + AGENT_W - PAD - 4;
  var PANEL_H = TASKS.length * ROW_H + PAD * 2;
  var PANEL_Y = TOP_Y + 24;
  var ARROW_Y = PANEL_Y + PANEL_H + 30;

  var svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("width", "100%");
  svg.style.maxWidth = W + "px";
  svg.style.margin = "1.5rem auto 0";
  svg.style.display = "block";
  container.appendChild(svg);

  var style = document.createElementNS(ns, "style");
  style.textContent = [
    ".tl-panel { fill: #0c0b13; stroke: #1b1826; stroke-width: 1; }",
    ".tl-col-title { fill: #5c5968; font: 600 10px ui-monospace, monospace; letter-spacing: 0.14em; }",
    ".tl-col-title.active { fill: #a78bfa; }",
    ".tl-row { opacity: 0; transition: opacity .3s ease; }",
    ".tl-row.show { opacity: 1; }",
    ".tl-dot { fill: #07060b; stroke: #5c5968; stroke-width: 1.5; transition: fill .4s, stroke .4s; }",
    ".tl-dot.progress { fill: #8b5cf6; stroke: #a78bfa; }",
    ".tl-dot.done { fill: #07060b; stroke: #4ade80; }",
    ".tl-check { fill: none; stroke: #4ade80; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 10; stroke-dashoffset: 10; transition: stroke-dashoffset .3s ease .12s; }",
    ".tl-check.show { stroke-dashoffset: 0; }",
    ".tl-label { fill: #8a8798; font: 12px ui-monospace, monospace; transition: fill .4s; }",
    ".tl-label.progress { fill: #e8e6f0; }",
    ".tl-label.done { fill: #5c5968; }",
    ".tl-status { fill: #5c5968; font: 10px ui-monospace, monospace; text-anchor: end; transition: fill .4s; }",
    ".tl-status.progress { fill: #8b5cf6; }",
    ".tl-status.done { fill: #4ade80; opacity: 0.5; }",
    ".tl-status.nag { fill: #ef4444; }",
    ".tl-nag-ring { fill: none; stroke: #ef4444; stroke-width: 1.5; opacity: 0; transition: opacity .2s; }",
    ".tl-nag-ring.active { animation: tl-nag-pulse .7s ease-in-out infinite; }",
    "@keyframes tl-nag-pulse { 0%,100% { opacity: 0; } 50% { opacity: 0.8; } }",
    ".tl-client-row { fill: #8a8798; font: 11px ui-monospace, monospace; opacity: 0; transition: opacity .3s; }",
    ".tl-client-row.show { opacity: 1; }",
    ".tl-client-row.active { fill: #a78bfa; }",
    ".tl-anno { fill: #a78bfa; font: 11px ui-monospace, monospace; text-anchor: middle; transition: opacity .2s; }",
    // Arrow
    ".tl-arrow-path { fill: none; stroke: #8b5cf6; stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: 200; stroke-dashoffset: 200; transition: stroke-dashoffset .5s ease; }",
    ".tl-arrow-path.draw { stroke-dashoffset: 0; }",
    ".tl-arrow-path.fading { opacity: 0; transition: opacity .3s ease .3s; }",
    ".tl-arrow-head { fill: #8b5cf6; opacity: 0; transition: opacity .15s ease; }",
    ".tl-arrow-head.show { opacity: 1; }",
    ".tl-arrow-label { fill: #a78bfa; font: 10px ui-monospace, monospace; text-anchor: middle; opacity: 0; transition: opacity .2s ease .2s; }",
    ".tl-arrow-label.show { opacity: 0.85; }",
    ".tl-arrow-label.nag { fill: #ef4444; }",
    ".tl-arrow-path.nag { stroke: #ef4444; }",
    ".tl-arrow-head.nag { fill: #ef4444; }"
  ].join("\n");
  svg.appendChild(style);

  // ── Agent column (left) ──
  var agPanel = document.createElementNS(ns, "rect");
  agPanel.setAttribute("class", "tl-panel");
  agPanel.setAttribute("x", AGENT_X);
  agPanel.setAttribute("y", PANEL_Y);
  agPanel.setAttribute("width", AGENT_W);
  agPanel.setAttribute("height", PANEL_H);
  agPanel.setAttribute("rx", 6);
  svg.appendChild(agPanel);

  var agTitle = document.createElementNS(ns, "text");
  agTitle.setAttribute("class", "tl-col-title");
  agTitle.setAttribute("x", AGENT_X + 4);
  agTitle.setAttribute("y", PANEL_Y - 6);
  agTitle.textContent = "AGENT";
  svg.appendChild(agTitle);

  // ── Client column (right) ──
  var cliPanel = document.createElementNS(ns, "rect");
  cliPanel.setAttribute("class", "tl-panel");
  cliPanel.setAttribute("x", CLIENT_X);
  cliPanel.setAttribute("y", PANEL_Y);
  cliPanel.setAttribute("width", CLIENT_W);
  cliPanel.setAttribute("height", PANEL_H);
  cliPanel.setAttribute("rx", 6);
  svg.appendChild(cliPanel);

  var cliTitle = document.createElementNS(ns, "text");
  cliTitle.setAttribute("class", "tl-col-title");
  cliTitle.setAttribute("x", CLIENT_X + 4);
  cliTitle.setAttribute("y", PANEL_Y - 6);
  cliTitle.textContent = "CLIENT";
  svg.appendChild(cliTitle);

  // ── Task rows (agent side) ──
  var rows = [];
  for (var i = 0; i < TASKS.length; i++) {
    var y = PANEL_Y + PAD + i * ROW_H + ROW_H / 2;
    var g = document.createElementNS(ns, "g");
    g.setAttribute("class", "tl-row");

    var dot = document.createElementNS(ns, "circle");
    dot.setAttribute("class", "tl-dot");
    dot.setAttribute("cx", DOT_CX);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", DOT_R);
    g.appendChild(dot);

    var check = document.createElementNS(ns, "path");
    check.setAttribute("class", "tl-check");
    check.setAttribute("d", "M " + (DOT_CX - 2.5) + " " + y + " L " + (DOT_CX - 0.5) + " " + (y + 2) + " L " + (DOT_CX + 3) + " " + (y - 2.5));
    g.appendChild(check);

    var nagRing = document.createElementNS(ns, "circle");
    nagRing.setAttribute("class", "tl-nag-ring");
    nagRing.setAttribute("cx", DOT_CX);
    nagRing.setAttribute("cy", y);
    nagRing.setAttribute("r", DOT_R + 4);
    g.appendChild(nagRing);

    var label = document.createElementNS(ns, "text");
    label.setAttribute("class", "tl-label");
    label.setAttribute("x", TEXT_X);
    label.setAttribute("y", y + 3);
    label.textContent = TASKS[i];
    g.appendChild(label);

    var status = document.createElementNS(ns, "text");
    status.setAttribute("class", "tl-status");
    status.setAttribute("x", STATUS_X);
    status.setAttribute("y", y + 3);
    status.textContent = "pending";
    g.appendChild(status);

    svg.appendChild(g);
    rows.push({ group: g, dot: dot, check: check, nagRing: nagRing, label: label, status: status });
  }

  // ── Client-side state display ──
  var cliLines = [];
  var cliTexts = [
    "determine_next_prompt()",
    "→ start_next_task()",
    "current: task 0",
    "current: task 1",
    "current: task 2",
    "current: task 3",
    "nag_incomplete()",
    "loop exited"
  ];
  for (var ci = 0; ci < 3; ci++) {
    var cl = document.createElementNS(ns, "text");
    cl.setAttribute("class", "tl-client-row");
    cl.setAttribute("x", CLIENT_X + PAD);
    cl.setAttribute("y", PANEL_Y + PAD + ci * 20 + 14);
    svg.appendChild(cl);
    cliLines.push(cl);
  }
  var cliLineIdx = 0;
  function cliSay(text, active) {
    var cl = cliLines[cliLineIdx % cliLines.length];
    cl.textContent = text;
    cl.classList.add("show");
    cl.classList.toggle("active", !!active);
    cliLineIdx++;
  }

  // ── Arrow system ──
  // We create one reusable arrow group and redraw it each time
  var arrowGroup = document.createElementNS(ns, "g");
  svg.appendChild(arrowGroup);

  function arrow(fromX, toX, y, label, isNag) {
    // Clear previous arrow
    while (arrowGroup.firstChild) arrowGroup.removeChild(arrowGroup.firstChild);

    var dir = toX > fromX ? 1 : -1;
    var headSize = 5;
    var headX = toX - dir * 2;

    var path = document.createElementNS(ns, "path");
    path.setAttribute("class", "tl-arrow-path" + (isNag ? " nag" : ""));
    path.setAttribute("d", "M " + fromX + " " + y + " L " + toX + " " + y);
    arrowGroup.appendChild(path);

    var head = document.createElementNS(ns, "polygon");
    head.setAttribute("class", "tl-arrow-head" + (isNag ? " nag" : ""));
    head.setAttribute("points",
      headX + "," + y + " " +
      (headX - dir * headSize) + "," + (y - headSize * 0.6) + " " +
      (headX - dir * headSize) + "," + (y + headSize * 0.6)
    );
    arrowGroup.appendChild(head);

    var labelText = document.createElementNS(ns, "text");
    labelText.setAttribute("class", "tl-arrow-label" + (isNag ? " nag" : ""));
    labelText.setAttribute("x", (fromX + toX) / 2);
    labelText.setAttribute("y", y - 6);
    labelText.textContent = label;
    arrowGroup.appendChild(labelText);

    // Animate: draw path, then show head + label
    // Force reflow then add draw class
    void path.getBBox();
    path.classList.add("draw");
    head.classList.add("show");
    labelText.classList.add("show");

    return {
      fadeOut: function () {
        path.classList.add("fading");
        head.classList.remove("show");
        labelText.classList.remove("show");
      }
    };
  }

  // ── Annotation ──
  var anno = document.createElementNS(ns, "text");
  anno.setAttribute("class", "tl-anno");
  anno.setAttribute("x", W / 2);
  anno.setAttribute("y", H - 8);
  anno.style.opacity = 0;
  svg.appendChild(anno);

  var annoTimer = null;
  function setAnno(text) {
    if (annoTimer) clearTimeout(annoTimer);
    anno.style.opacity = 0;
    annoTimer = setTimeout(function () {
      anno.textContent = text;
      anno.style.opacity = 1;
      annoTimer = null;
    }, 150);
  }

  // ── State management ──
  function setState(i, state) {
    var r = rows[i];
    r.group.classList.toggle("show", state !== "hidden");
    r.dot.classList.remove("progress", "done");
    r.check.classList.remove("show");
    r.label.classList.remove("progress", "done");
    r.status.classList.remove("progress", "done", "nag");
    r.nagRing.classList.remove("active");

    if (state === "pending") {
      r.status.textContent = "pending";
    } else if (state === "progress") {
      r.dot.classList.add("progress");
      r.label.classList.add("progress");
      r.status.classList.add("progress");
      r.status.textContent = "in_progress";
    } else if (state === "done") {
      r.dot.classList.add("done");
      r.check.classList.add("show");
      r.label.classList.add("done");
      r.status.classList.add("done");
      r.status.textContent = "completed";
    }
  }

  function clearAll() {
    for (var i = 0; i < rows.length; i++) {
      (function (idx, delay) {
        setTimeout(function () { rows[idx].group.classList.remove("show"); }, delay);
      })(i, i * 60);
    }
  }

  function resetAll() {
    for (var i = 0; i < rows.length; i++) setState(i, "hidden");
    cliLines.forEach(function (cl) { cl.classList.remove("show", "active"); });
    cliLineIdx = 0;
    while (arrowGroup.firstChild) arrowGroup.removeChild(arrowGroup.firstChild);
  }

  function resetClient() {
    cliLines.forEach(function (cl) { cl.classList.remove("show", "active"); });
    cliLineIdx = 0;
  }

  // ── Timeline ──
  // Each step: { d: delay, fn: action }
  // Arrows fly in the lane between AGENT (left) and CLIENT (right)
  // Agent→Client = left to right, Client→Agent = right to left
  var aY = ARROW_Y; // y position for arrows

  var steps = [
    // Agent writes its task list, sends it to client
    { d: 400, fn: function () { setAnno("agent calls task_write"); } },
    { d: 500, fn: function () { setState(0, "pending"); setState(1, "pending"); setState(2, "pending"); setState(3, "pending"); } },
    { d: 600, fn: function () { arrow(LANE_L, LANE_R, aY, "task_write", false); setAnno("task list → client"); } },
    { d: 900, fn: function () {} },

    // Client: determine_next_prompt → start_next_task
    { d: 400, fn: function () { cliSay("determine_next_prompt()", true); setAnno("client: state machine runs"); } },
    { d: 700, fn: function () { cliSay("→ start_next_task()"); } },
    { d: 500, fn: function () { arrow(LANE_R, LANE_L, aY, "prompt", false); setAnno("nudge → agent"); } },
    { d: 800, fn: function () { setState(0, "progress"); setAnno("agent working on task 0"); } },
    { d: 1600, fn: function () {} },

    // Task 0 done, agent sends update
    { d: 400, fn: function () { setState(0, "done"); arrow(LANE_L, LANE_R, aY, "task_write", false); setAnno("task 0 done → client"); } },
    { d: 800, fn: function () { resetClient(); cliSay("→ advance", true); } },
    { d: 600, fn: function () { arrow(LANE_R, LANE_L, aY, "prompt", false); } },
    { d: 600, fn: function () { setState(1, "progress"); setAnno("agent working on task 1"); } },
    { d: 1400, fn: function () {} },

    // Task 1 done
    { d: 400, fn: function () { setState(1, "done"); arrow(LANE_L, LANE_R, aY, "task_write", false); setAnno("task 1 done → client"); } },
    { d: 800, fn: function () { resetClient(); cliSay("→ advance", true); } },
    { d: 600, fn: function () { arrow(LANE_R, LANE_L, aY, "prompt", false); } },
    { d: 600, fn: function () { setState(2, "progress"); setAnno("agent working on task 2"); } },
    { d: 1200, fn: function () {} },

    // Agent stops — task incomplete
    { d: 500, fn: function () { setAnno("agent stopped — task incomplete"); } },
    { d: 800, fn: function () { resetClient(); cliSay("determine_next_prompt()", true); cliSay("→ nag_incomplete()"); } },

    // NAG — client sends nag to agent
    { d: 500, fn: function () { arrow(LANE_R, LANE_L, aY, "NAG", true); rows[2].nagRing.classList.add("active"); rows[2].status.classList.add("nag"); rows[2].status.textContent = "← NAG"; setAnno("nag_incomplete → agent"); } },
    { d: 2800, fn: function () { rows[2].nagRing.classList.remove("active"); rows[2].status.classList.remove("nag"); rows[2].status.textContent = "in_progress"; } },

    // Agent resumes, finishes task 2
    { d: 600, fn: function () { setState(2, "done"); arrow(LANE_L, LANE_R, aY, "task_write", false); setAnno("task 2 done → client"); } },
    { d: 800, fn: function () { resetClient(); cliSay("→ advance", true); } },
    { d: 600, fn: function () { arrow(LANE_R, LANE_L, aY, "prompt", false); } },
    { d: 600, fn: function () { setState(3, "progress"); setAnno("agent working on task 3"); } },
    { d: 1200, fn: function () {} },

    // Task 3 done — all complete
    { d: 400, fn: function () { setState(3, "done"); arrow(LANE_L, LANE_R, aY, "task_write([])", false); setAnno("all done → clear list"); } },
    { d: 800, fn: function () { resetClient(); cliSay("loop exited", true); cliSay("→ notify caller"); } },
    { d: 700, fn: function () { clearAll(); setAnno("caller notified — done"); } },
    { d: 2000, fn: function () {} }
  ];

  var stepIdx = 0;
  var timers = [];
  var running = false;

  function tick() {
    if (!running) return;
    if (stepIdx >= steps.length) {
      running = false;
      resetAll();
      anno.style.opacity = 0;
      timers.push(setTimeout(function () { running = true; stepIdx = 0; tick(); }, 500));
      return;
    }
    var step = steps[stepIdx];
    step.fn();
    stepIdx++;
    timers.push(setTimeout(tick, step.d));
  }

  function stop() {
    running = false;
    timers.forEach(clearTimeout);
    timers = [];
    if (annoTimer) clearTimeout(annoTimer);
  }

  function start() {
    stop();
    resetAll();
    anno.style.opacity = 0;
    stepIdx = 0;
    running = true;
    tick();
  }

  function showStatic() {
    for (var i = 0; i < TASKS.length; i++) setState(i, "done");
    cliSay("loop exited", true);
    setAnno("all tasks completed — loop exits");
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (reduce) { showStatic(); }
          else { start(); }
        } else {
          stop();
        }
      });
    }, { threshold: 0.35 });
    io.observe(container);
  } else if (reduce) {
    showStatic();
  } else {
    start();
  }
})();
