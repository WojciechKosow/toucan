/*
 * Toucan shared runtime. Identical for every animation type and every bundle.
 *
 * Responsibilities:
 *   1. Read the baked-in spec + theme (inlined as JSON script tags).
 *   2. Apply the theme tokens as CSS custom properties + fit the fixed 1280x720 stage to the
 *      viewport (so previews and MP4 frames look the same at any size).
 *   3. Hand the stage/spec/theme to the type renderer, which returns { duration, seek }.
 *   4. Expose the MP4 capture contract: window.__duration (ms) and window.__seek(ms) — a pure
 *      function of time, so a headless worker can step frame-by-frame.
 *   5. Drive autoplay + gentle looping from a single requestAnimationFrame master clock. The clock
 *      only computes "elapsed since start"; the actual drawing always goes through __seek, so there
 *      is no other wall-clock or randomness anywhere in the animation.
 */
(function () {
  "use strict";

  function readJson(id) {
    var el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  }

  var spec = readJson("toucan-spec");
  var theme = readJson("toucan-theme");
  var stage = document.getElementById("toucan-stage");

  // --- Theme -> CSS variables (used by template + DOM-based renderers). ---
  var root = document.documentElement.style;
  root.setProperty("--bg", theme.background);
  root.setProperty("--surface", theme.surface);
  root.setProperty("--node-fill", theme.nodeFill);
  root.setProperty("--node-border", theme.nodeBorder);
  root.setProperty("--node-text", theme.nodeText);
  root.setProperty("--muted-text", theme.mutedText);
  root.setProperty("--accent", theme.accent);
  root.setProperty("--accent-soft", theme.accentSoft);
  root.setProperty("--connector", theme.connector);
  root.setProperty("--font-sans", theme.fontSans);
  root.setProperty("--font-mono", theme.fontMono);
  document.body.style.background = theme.background;

  // --- Fit the fixed design stage into the viewport. ---
  function fit() {
    var sx = window.innerWidth / 1280;
    var sy = window.innerHeight / 720;
    var s = Math.min(sx, sy);
    stage.style.transform = "scale(" + s + ")";
  }
  fit();
  window.addEventListener("resize", fit);

  // --- Hand off to the type renderer. ---
  var renderer = window.__TOUCAN_RENDERER__;
  if (typeof renderer !== "function") {
    throw new Error("Toucan: no renderer registered for this bundle.");
  }
  var instance = renderer(stage, spec, theme);
  var duration = Math.max(1, Math.round(instance.duration));

  // --- MP4 capture contract. ---
  window.__duration = duration;
  window.__seek = function (ms) {
    var t = ms;
    if (t < 0) t = 0;
    if (t > duration) t = duration;
    instance.seek(t);
  };

  // --- Autoplay + loop from one master clock. ---
  var startTs = null;
  function frame(ts) {
    if (startTs === null) startTs = ts;
    var elapsed = (ts - startTs) % duration;
    window.__seek(elapsed);
    requestAnimationFrame(frame);
  }
  window.__seek(0);
  requestAnimationFrame(frame);
})();
