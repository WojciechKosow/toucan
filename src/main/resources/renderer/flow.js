/*
 * Type 1 — Sequential Flow renderer (the hero type).
 *
 * Draws an ordered chain of 3–6 nodes with a single traveler that hops along the connectors. Every
 * frame is a pure function of time t (ms): seek(t) fully redraws the canvas with no retained motion
 * state, which is what makes frame-by-frame MP4 capture exact.
 *
 * Choreography (beats), all derived from the spec:
 *   1. Intro  — nodes fade/scale in with a stagger; connectors draw in behind them.
 *   2. Travel — for each consecutive pair i -> i+1: node i is active, the traveler eases along the
 *               connector to i+1, and on arrival i deactivates while i+1 activates.
 *   3. Outro  — the final node pulses; the title remains.
 */
window.__TOUCAN_RENDERER__ = function (stage, spec, theme) {
  "use strict";

  var W = 1280, H = 720;
  var canvas = document.createElement("canvas");
  var dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  stage.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  var nodes = spec.nodes;
  var n = nodes.length;
  var horizontal = spec.direction !== "vertical";
  var beat = spec.beatDurationMs || theme.beatDurationMs || 900;

  // ---- math helpers ----
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function smooth(edge0, edge1, x) { var t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

  // ---- layout (auto-fit to the fixed canvas regardless of node count) ----
  var hasSub = nodes.some(function (nd) { return nd.sublabel; });
  var titleSpace = spec.title ? 96 : 40;
  var nodeW, nodeH, centers = [];

  if (horizontal) {
    var marginX = 80;
    var usable = W - marginX * 2;
    var slot = usable / n;
    nodeW = Math.min(220, slot * 0.66);
    nodeH = hasSub ? 104 : 78;
    var cy = titleSpace + (H - titleSpace) / 2;
    for (var i = 0; i < n; i++) {
      centers.push({ x: marginX + slot * (i + 0.5), y: cy });
    }
  } else {
    var marginY = titleSpace + 30;
    var usableY = H - marginY - 60;
    var slotY = usableY / n;
    nodeH = Math.min(92, slotY * 0.62);
    nodeW = 320;
    var cx = W / 2;
    for (var j = 0; j < n; j++) {
      centers.push({ x: cx, y: marginY + slotY * (j + 0.5) });
    }
  }

  // ---- timeline ----
  var introStagger = beat * 0.30;
  var nodeInDur = beat * 0.55;
  var introEnd = (n - 1) * introStagger + nodeInDur;
  var settle = beat * 0.30;
  var travelStart = introEnd + settle;
  // arrival[k] = moment the traveler is sitting at node k
  var arrival = [];
  for (var k = 0; k < n; k++) arrival.push(travelStart + k * beat);
  var travelEnd = arrival[n - 1];
  var outroDur = beat * 1.4;
  var tailHold = beat * 0.5;
  var duration = travelEnd + outroDur + tailHold;

  function nodeAppearAt(i) { return i * introStagger; }

  // How "alive" a node is, 0..1, including intro reveal and active glow.
  function nodeReveal(i, t) {
    return easeOut(clamp((t - nodeAppearAt(i)) / nodeInDur, 0, 1));
  }
  var ramp = beat * 0.20;
  function nodeActive(i, t) {
    if (t < travelStart) return 0;
    var rise = clamp((t - (arrival[i] - ramp)) / ramp, 0, 1);
    var fall = 1;
    if (i < n - 1) fall = 1 - clamp((t - (arrival[i + 1] - ramp)) / ramp, 0, 1);
    return Math.min(rise, fall);
  }

  // ---- drawing ----
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function nodeRect(i) {
    var c = centers[i];
    return { x: c.x - nodeW / 2, y: c.y - nodeH / 2, w: nodeW, h: nodeH };
  }

  // Edge point on node i facing node j, used as connector / traveler endpoints.
  function edge(i, towardNext) {
    var r = nodeRect(i);
    if (horizontal) {
      return { x: towardNext ? r.x + r.w : r.x, y: r.y + r.h / 2 };
    }
    return { x: r.x + r.w / 2, y: towardNext ? r.y + r.h : r.y };
  }

  function drawConnector(i, t) {
    var a = edge(i, true);
    var b = edge(i + 1, false);
    // draw-in progress tied to when the *target* node starts appearing
    var p = easeOut(clamp((t - nodeAppearAt(i + 1)) / (beat * 0.5), 0, 1));
    if (p <= 0) return;
    var ex = lerp(a.x, b.x, p), ey = lerp(a.y, b.y, p);
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.connector;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // accent fill of the segment up to the traveler while this hop is in progress
    if (t >= arrival[i] && t < arrival[i + 1]) {
      var hp = easeInOut(clamp(((t - arrival[i]) / beat - 0.12) / 0.80, 0, 1));
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(lerp(a.x, b.x, hp), lerp(a.y, b.y, hp));
      ctx.stroke();
    }
    // arrowhead at the far end once drawn
    if (p > 0.98) drawArrow(a, b);
  }

  function drawArrow(a, b) {
    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var s = 9;
    ctx.fillStyle = theme.connector;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - s * Math.cos(ang - 0.4), b.y - s * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - s * Math.cos(ang + 0.4), b.y - s * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  function drawNode(i, t) {
    var reveal = nodeReveal(i, t);
    if (reveal <= 0) return;
    var active = nodeActive(i, t);

    // outro pulse on the final node
    var pulse = 0;
    if (i === n - 1 && t >= travelEnd) {
      var op = (t - travelEnd) / outroDur;
      pulse = Math.sin(op * Math.PI * 3) * Math.max(0, 1 - op);
    }

    var c = centers[i];
    var scale = lerp(0.86, 1, reveal) + active * 0.04 + Math.max(0, pulse) * 0.05;
    var r = nodeRect(i);

    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.translate(c.x, c.y);
    ctx.scale(scale, scale);
    ctx.translate(-c.x, -c.y);

    // active glow
    if (active > 0 || pulse > 0) {
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 26 * Math.max(active, Math.abs(pulse));
    }
    roundRect(r.x, r.y, r.w, r.h, theme.radius);
    ctx.fillStyle = theme.nodeFill;
    ctx.fill();
    ctx.shadowBlur = 0;

    // border (accent when active)
    roundRect(r.x, r.y, r.w, r.h, theme.radius);
    ctx.lineWidth = active > 0.02 ? 2.5 : 1.5;
    ctx.strokeStyle = blend(theme.nodeBorder, theme.accent, active);
    ctx.stroke();

    // labels
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.fillStyle = theme.nodeText;
    var labelY = nodes[i].sublabel ? c.y - 6 : c.y;
    ctx.font = "600 22px " + theme.fontSans;
    ctx.textBaseline = "middle";
    fitText(nodes[i].label, c.x, labelY, r.w - 24);
    if (nodes[i].sublabel) {
      ctx.fillStyle = theme.mutedText;
      ctx.font = "400 14px " + theme.fontSans;
      fitText(nodes[i].sublabel, c.x, c.y + 20, r.w - 20);
    }
    ctx.restore();
  }

  function fitText(text, x, y, maxW) {
    var t = text;
    while (ctx.measureText(t).width > maxW && t.length > 3) {
      t = t.slice(0, -2);
    }
    if (t !== text) t = t.replace(/\s*$/, "") + "…";
    ctx.fillText(t, x, y);
  }

  function drawTraveler(t) {
    if (t < arrival[0]) return;
    var pos;
    if (t >= travelEnd) {
      var last = edge(n - 1, false);
      pos = { x: centers[n - 1].x, y: centers[n - 1].y };
      // tuck the dot at the final node center during outro
      pos = { x: pos.x, y: pos.y };
    } else {
      var k = clamp(Math.floor((t - travelStart) / beat), 0, n - 2);
      var a = edge(k, true), b = edge(k + 1, false);
      var hp = easeInOut(clamp(((t - arrival[k]) / beat - 0.12) / 0.80, 0, 1));
      pos = { x: lerp(a.x, b.x, hp), y: lerp(a.y, b.y, hp) };
    }
    // glow + dot
    ctx.save();
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 22;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (spec.traveler && spec.traveler.label) {
      ctx.fillStyle = theme.accent;
      ctx.font = "500 13px " + theme.fontMono;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(spec.traveler.label, pos.x, pos.y - 16);
    }
  }

  function drawTitle() {
    if (!spec.title) return;
    ctx.fillStyle = theme.nodeText;
    ctx.font = "600 30px " + theme.fontSans;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(spec.title, W / 2, 50, W - 160);
  }

  // very small hex/rgba mixer for the active-border transition
  function blend(c1, c2, t) {
    var a = parseColor(c1), b = parseColor(c2);
    if (!a || !b) return t > 0.5 ? c2 : c1;
    var r = Math.round(lerp(a[0], b[0], t));
    var g = Math.round(lerp(a[1], b[1], t));
    var bl = Math.round(lerp(a[2], b[2], t));
    return "rgb(" + r + "," + g + "," + bl + ")";
  }
  function parseColor(c) {
    if (c[0] === "#") {
      var h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { var p = m[1].split(",").map(Number); return [p[0], p[1], p[2]]; }
    return null;
  }

  function seek(t) {
    ctx.clearRect(0, 0, W, H);
    drawTitle();
    for (var i = 0; i < n - 1; i++) drawConnector(i, t);
    for (var j = 0; j < n; j++) drawNode(j, t);
    drawTraveler(t);
  }

  return { duration: duration, seek: seek };
};
