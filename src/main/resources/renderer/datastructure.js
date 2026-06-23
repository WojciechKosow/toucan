/*
 * Type 3 — Data Structure renderer.
 *
 * Visualises operations on a basic structure (array, stack, linked list), one operation per beat.
 * States are precomputed by replaying the operations over `initial`; each beat animates the
 * transition between consecutive states (push slides/fades in, pop slides out, highlight pulses).
 * seek(t) draws purely from t, so capture and looping are exact.
 */
window.__TOUCAN_RENDERER__ = function (stage, spec, theme) {
  "use strict";

  var W = 1280, H = 720;
  var canvas = document.createElement("canvas");
  var dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  stage.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  var structure = spec.structure;
  var beat = spec.beatDurationMs || theme.beatDurationMs || 1000;
  var ops = spec.operations || [];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }

  // ---- precompute states ----
  function str(v) { return v === null || v === undefined ? "" : String(v); }
  var states = [spec.initial.map(str)];
  for (var i = 0; i < ops.length; i++) {
    var prev = states[i].slice();
    var op = ops[i];
    if (op.op === "push") prev.push(str(op.value));
    else if (op.op === "pop") prev.pop();
    states.push(prev);
  }

  var introDur = states[0].length > 0 ? beat * 0.9 : 0;
  var hold = beat * 0.9;
  var duration = introDur + ops.length * beat + hold;

  // ---- geometry ----
  var isStack = structure === "stack";
  var isList = structure === "linkedlist";
  var cellW = isStack ? 150 : 88;
  var cellH = isStack ? 60 : 88;
  var gap = isList ? 46 : isStack ? 12 : 16;
  var cy = H / 2 + 10;

  function rowStartX(count) {
    var total = count * cellW + (count - 1) * gap;
    return (W - total) / 2;
  }
  // returns {x,y} top-left of element at logical index `idx` for a layout of `count` elements
  function cellPos(idx, count) {
    if (isStack) {
      var baseBottom = cy + 150;
      return { x: (W - cellW) / 2, y: baseBottom - (idx + 1) * (cellH + gap) };
    }
    var sx = rowStartX(count);
    return { x: sx + idx * (cellW + gap), y: cy - cellH / 2 };
  }

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

  function drawCell(x, y, value, opts) {
    opts = opts || {};
    ctx.save();
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    var scale = opts.scale || 1;
    if (scale !== 1) {
      ctx.translate(x + cellW / 2, y + cellH / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(x + cellW / 2), -(y + cellH / 2));
    }
    if (opts.glow) { ctx.shadowColor = theme.accent; ctx.shadowBlur = 28 * opts.glow; }
    roundRect(x, y, cellW, cellH, theme.radius);
    ctx.fillStyle = theme.nodeFill;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(x, y, cellW, cellH, theme.radius);
    ctx.lineWidth = opts.active ? 2.5 : 1.5;
    ctx.strokeStyle = opts.active ? theme.accent : theme.nodeBorder;
    ctx.stroke();
    ctx.fillStyle = theme.nodeText;
    ctx.font = "600 26px " + theme.fontMono;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(value, x + cellW / 2, y + cellH / 2);
    ctx.restore();
  }

  function drawArrow(fromIdx, count) {
    // connector between list nodes (linked list only)
    var a = cellPos(fromIdx, count);
    var x1 = a.x + cellW, y = a.y + cellH / 2;
    var x2 = x1 + gap;
    ctx.strokeStyle = theme.connector; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2 - 6, y); ctx.stroke();
    ctx.fillStyle = theme.connector;
    ctx.beginPath();
    ctx.moveTo(x2, y); ctx.lineTo(x2 - 8, y - 5); ctx.lineTo(x2 - 8, y + 5);
    ctx.closePath(); ctx.fill();
  }

  function drawIndexLabels(count) {
    if (isStack) return;
    ctx.fillStyle = theme.mutedText;
    ctx.font = "400 14px " + theme.fontMono;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (var i = 0; i < count; i++) {
      var p = cellPos(i, count);
      ctx.fillText(String(i), p.x + cellW / 2, p.y + cellH + 10);
    }
  }

  function drawTitle() {
    ctx.fillStyle = theme.nodeText;
    ctx.font = "600 26px " + theme.fontSans;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    var name = isList ? "linked list" : structure;
    ctx.fillText(name, 64, 60);
  }

  function drawStackTopLabel(count) {
    if (!isStack || count === 0) return;
    var top = cellPos(count - 1, count);
    ctx.fillStyle = theme.accent;
    ctx.font = "500 14px " + theme.fontMono;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("top", top.x + cellW + 16, top.y + cellH / 2);
  }

  // draw a settled list of values (no transient element)
  function drawList(values, opts) {
    opts = opts || {};
    var count = values.length;
    for (var i = 0; i < count; i++) {
      if (isList && i < count - 1) drawArrow(i, count);
      var p = cellPos(i, count);
      var active = opts.highlightIndex === i;
      drawCell(p.x, p.y, values[i], {
        active: active,
        glow: active ? (opts.glowAmt || 0) : 0,
        scale: active ? 1 + 0.06 * (opts.glowAmt || 0) : 1
      });
    }
    drawIndexLabels(count);
    drawStackTopLabel(count);
  }

  function seek(t) {
    ctx.clearRect(0, 0, W, H);
    drawTitle();

    // intro: stagger-reveal the initial elements
    if (t < introDur) {
      var init = states[0];
      var count = init.length;
      for (var i = 0; i < count; i++) {
        if (isList && i < count - 1) {
          var pa = easeOut((t / introDur) - i * 0.12);
          if (pa > 0.4) drawArrow(i, count);
        }
        var p = cellPos(i, count);
        var a = easeOut((t / introDur) * count - i);
        if (a <= 0) continue;
        drawCell(p.x, p.y, init[i], { alpha: a, scale: lerp(0.8, 1, a) });
      }
      drawIndexLabels(count);
      drawStackTopLabel(count);
      return;
    }

    var localT = t - introDur;
    if (ops.length === 0) { drawList(states[0]); return; }
    var k = clamp(Math.floor(localT / beat), 0, ops.length - 1);
    var within = clamp((localT - k * beat) / beat, 0, 1);
    var op = ops[k];
    var before = states[k], after = states[k + 1];

    if (op.op === "push") {
      var count = after.length;            // layout for the larger state, so it doesn't jump
      for (var i = 0; i < before.length; i++) {
        if (isList && i < count - 1) drawArrow(i, count);
        var pp = cellPos(i, count);
        drawCell(pp.x, pp.y, before[i], {});
      }
      var e = easeOut(within);
      var np = cellPos(before.length, count);
      var dy = isStack ? -50 : 0, dx = isStack ? 0 : 40;
      if (isList && before.length > 0 && e > 0.5) drawArrow(before.length - 1, count);
      drawCell(np.x + dx * (1 - e), np.y + dy * (1 - e), after[before.length], {
        alpha: e, scale: lerp(0.7, 1, e)
      });
      drawIndexLabels(Math.round(lerp(before.length, count, e)));
      drawStackTopLabel(e > 0.6 ? count : before.length);
    } else if (op.op === "pop") {
      var count2 = before.length;          // larger state
      for (var j = 0; j < after.length; j++) {
        if (isList && j < count2 - 1) drawArrow(j, count2);
        var ap = cellPos(j, count2);
        drawCell(ap.x, ap.y, after[j], {});
      }
      var ex = 1 - easeOut(within);
      var rp = cellPos(before.length - 1, count2);
      var ody = isStack ? -50 : 0, odx = isStack ? 0 : 40;
      drawCell(rp.x + odx * (1 - ex), rp.y + ody * (1 - ex), before[before.length - 1], {
        alpha: ex, scale: lerp(0.7, 1, ex)
      });
      drawIndexLabels(after.length);
      drawStackTopLabel(after.length);
    } else {
      // highlight
      var glow = Math.sin(within * Math.PI);
      drawList(before, { highlightIndex: op.index, glowAmt: glow });
    }
  }

  return { duration: duration, seek: seek };
};
