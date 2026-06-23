/*
 * Type 2 — Animated Code Block renderer.
 *
 * A code panel with line numbers and syntax highlighting; steps progressively reveal (type) lines,
 * highlight lines (dimming the rest) and show an annotation callout. Like every Toucan renderer,
 * seek(t) is a pure function of time: the "typing" is computed as a character count from t, not from
 * timers, so capture is exact and the animation loops cleanly.
 *
 * Note on highlighting: v0.1 ships a compact, self-contained tokenizer (the hard constraint is a
 * single file with no CDN/network). It covers C-like languages + Python well enough for short
 * snippets; a bundled Prism/Shiki build can be dropped in later behind this same seek contract.
 */
window.__TOUCAN_RENDERER__ = function (stage, spec, theme) {
  "use strict";

  var beat = spec.beatDurationMs || theme.beatDurationMs || 1200;
  var lines = spec.code.split("\n");
  var steps = spec.steps;

  // syntax palette (dark-theme defaults; keyword tracks the theme accent)
  var COL = {
    keyword: theme.accent,
    string: "#7ee787",
    number: "#ffab70",
    func: "#d2a8ff",
    comment: theme.mutedText,
    punct: theme.mutedText,
    text: theme.nodeText
  };

  var KEYWORDS = new RegExp(
    "^(?:abstract|async|await|boolean|break|byte|case|catch|char|class|const|continue|def|default|" +
    "del|do|double|elif|else|enum|export|extends|final|finally|float|for|from|func|function|go|if|" +
    "implements|import|in|instanceof|int|interface|is|lambda|let|long|map|new|nil|none|null|package|" +
    "pass|private|protected|public|range|return|self|short|static|struct|super|switch|this|throw|" +
    "throws|true|false|try|type|typeof|val|var|void|while|with|yield)$"
  );

  // ---- tokenizer: line -> [{t,c}] ----
  function tokenize(line) {
    var out = [];
    var i = 0, nLen = line.length;
    function push(t, c) { if (t) out.push({ t: t, c: c }); }
    while (i < nLen) {
      var ch = line[i];
      // line comments
      if ((ch === "/" && line[i + 1] === "/") || ch === "#") {
        push(line.slice(i), COL.comment); break;
      }
      // block comment (single-line slice)
      if (ch === "/" && line[i + 1] === "*") {
        var end = line.indexOf("*/", i + 2);
        end = end < 0 ? nLen : end + 2;
        push(line.slice(i, end), COL.comment); i = end; continue;
      }
      // strings
      if (ch === '"' || ch === "'" || ch === "`") {
        var j = i + 1;
        while (j < nLen && line[j] !== ch) { if (line[j] === "\\") j++; j++; }
        j = Math.min(j + 1, nLen);
        push(line.slice(i, j), COL.string); i = j; continue;
      }
      // numbers
      if (/[0-9]/.test(ch)) {
        var k = i;
        while (k < nLen && /[0-9._xa-fA-F]/.test(line[k])) k++;
        push(line.slice(i, k), COL.number); i = k; continue;
      }
      // identifiers / keywords / function calls
      if (/[A-Za-z_$]/.test(ch)) {
        var m = i;
        while (m < nLen && /[A-Za-z0-9_$]/.test(line[m])) m++;
        var word = line.slice(i, m);
        var col = COL.text;
        if (KEYWORDS.test(word)) col = COL.keyword;
        else if (line[m] === "(") col = COL.func;
        push(word, col); i = m; continue;
      }
      // punctuation / whitespace
      if (/\s/.test(ch)) {
        var w = i; while (w < nLen && /\s/.test(line[w])) w++;
        push(line.slice(i, w), COL.text); i = w; continue;
      }
      var p = i; while (p < nLen && /[^\w\s$"'`#]/.test(line[p])) p++;
      push(line.slice(i, p === i ? i + 1 : p), COL.punct);
      i = p === i ? i + 1 : p;
    }
    return out;
  }

  var tokens = lines.map(tokenize);

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // first step that types / references each line
  var revealStep = lines.map(function () { return -1; });
  var visibleStep = lines.map(function () { return 0; });
  var referenced = lines.map(function () { return false; });
  for (var s = 0; s < steps.length; s++) {
    (steps[s].revealLines || []).forEach(function (ln) {
      var idx = ln - 1;
      if (revealStep[idx] === -1) revealStep[idx] = s;
      if (!referenced[idx]) { referenced[idx] = true; visibleStep[idx] = s; }
    });
    (steps[s].highlightLines || []).forEach(function (ln) {
      var idx = ln - 1;
      if (!referenced[idx]) { referenced[idx] = true; visibleStep[idx] = s; }
    });
  }
  // lines never referenced are visible from the first beat
  for (var li = 0; li < lines.length; li++) {
    if (!referenced[li]) { visibleStep[li] = 0; revealStep[li] = -1; }
  }

  // ---- DOM ----
  var style = document.createElement("style");
  style.textContent =
    ".tc-wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:22px;padding:48px;}" +
    ".tc-editor{width:min(1040px,100%);background:var(--surface);border:1px solid var(--node-border);" +
    "border-radius:" + theme.radius + "px;box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden;}" +
    ".tc-chrome{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--node-border);}" +
    ".tc-dot{width:11px;height:11px;border-radius:50%;opacity:.5;background:var(--muted-text);}" +
    ".tc-file{margin-left:8px;color:var(--muted-text);font:500 13px var(--font-sans);}" +
    ".tc-code{padding:18px 22px;font-family:var(--font-mono);counter-reset:none;}" +
    ".tc-ln{display:flex;white-space:pre;transition:opacity .25s,background .25s;}" +
    ".tc-num{width:2.4em;flex:none;text-align:right;padding-right:1.2em;color:var(--node-border);user-select:none;}" +
    ".tc-src{flex:1;}" +
    ".tc-ln.tc-dim{opacity:.32;}" +
    ".tc-ln.tc-hl{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent);border-radius:4px;}" +
    ".tc-caret{display:inline-block;width:.6ch;background:var(--accent);animation:tcblink 1s steps(2,start) infinite;}" +
    "@keyframes tcblink{50%{opacity:0;}}" +
    ".tc-note{min-height:26px;max-width:760px;text-align:center;font:500 18px var(--font-sans);" +
    "color:var(--node-text);opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;}" +
    ".tc-note.tc-show{opacity:1;transform:translateY(0);}";
  stage.appendChild(style);

  var wrap = document.createElement("div"); wrap.className = "tc-wrap";
  var editor = document.createElement("div"); editor.className = "tc-editor";
  var chrome = document.createElement("div"); chrome.className = "tc-chrome";
  chrome.innerHTML = '<span class="tc-dot"></span><span class="tc-dot"></span><span class="tc-dot"></span>';
  var file = document.createElement("span"); file.className = "tc-file";
  file.textContent = spec.language && spec.language !== "text" ? spec.language : "snippet";
  chrome.appendChild(file);
  var codeEl = document.createElement("div"); codeEl.className = "tc-code";

  // scale font so the whole snippet fits the stage height
  var fontSize = lines.length > 16 ? 15 : lines.length > 11 ? 17 : 19;
  codeEl.style.fontSize = fontSize + "px";
  codeEl.style.lineHeight = "1.6";

  var lineEls = [];
  for (var l = 0; l < lines.length; l++) {
    var row = document.createElement("div"); row.className = "tc-ln";
    var num = document.createElement("span"); num.className = "tc-num"; num.textContent = (l + 1);
    var src = document.createElement("span"); src.className = "tc-src";
    row.appendChild(num); row.appendChild(src);
    codeEl.appendChild(row);
    lineEls.push({ row: row, src: src });
  }
  editor.appendChild(chrome); editor.appendChild(codeEl);
  var note = document.createElement("div"); note.className = "tc-note";
  wrap.appendChild(editor); wrap.appendChild(note);
  stage.appendChild(wrap);

  // partial highlighted HTML for `chars` characters of line idx (-1 = full, caret optional)
  function lineHtml(idx, chars, caret) {
    var toks = tokens[idx];
    if (chars < 0) {
      var full = "";
      toks.forEach(function (t) { full += '<span style="color:' + t.c + '">' + esc(t.t) + "</span>"; });
      return full || "&nbsp;";
    }
    var html = "", remaining = chars;
    for (var i = 0; i < toks.length && remaining > 0; i++) {
      var t = toks[i];
      var take = Math.min(remaining, t.t.length);
      html += '<span style="color:' + t.c + '">' + esc(t.t.slice(0, take)) + "</span>";
      remaining -= take;
    }
    if (caret) html += '<span class="tc-caret">&nbsp;</span>';
    return html || (caret ? '<span class="tc-caret">&nbsp;</span>' : "&nbsp;");
  }

  function easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }

  var hold = beat * 0.8;
  var duration = steps.length * beat + hold;

  function seek(t) {
    var step = Math.min(Math.floor(t / beat), steps.length - 1);
    if (step < 0) step = 0;
    var within = (t - step * beat) / beat; // 0..1 inside the current step
    var hl = steps[step].highlightLines || [];
    var anyHl = hl.length > 0;

    for (var i = 0; i < lines.length; i++) {
      var el = lineEls[i];
      var vStep = visibleStep[i];
      var rStep = revealStep[i];

      if (vStep > step) { el.row.style.opacity = "0"; el.src.innerHTML = "&nbsp;"; el.row.className = "tc-ln"; continue; }
      el.row.style.opacity = "1";

      if (rStep === step) {
        // typing in this beat: chars proportional to eased progress over first 60%
        var p = easeOut(within / 0.6);
        var total = lines[i].length;
        var chars = Math.round(p * total);
        var typing = chars < total;
        el.src.innerHTML = lineHtml(i, chars, typing);
      } else {
        el.src.innerHTML = lineHtml(i, -1, false);
      }

      var isHl = hl.indexOf(i + 1) >= 0;
      var cls = "tc-ln";
      if (isHl) cls += " tc-hl";
      else if (anyHl) cls += " tc-dim";
      el.row.className = cls;
    }

    if (steps[step].annotation) {
      note.textContent = steps[step].annotation;
      note.className = "tc-note" + (within > 0.15 ? " tc-show" : "");
    } else {
      note.className = "tc-note";
    }
  }

  return { duration: duration, seek: seek };
};
