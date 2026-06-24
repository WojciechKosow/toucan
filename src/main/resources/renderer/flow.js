/*
 * Type 1 — Sequential Flow renderer (visual overhaul v0.1.1).
 *
 * Architecture constraints (MUST NOT break):
 *   - seek(t) is a pure function of time: two calls with the same t produce pixel-identical output.
 *     No Date.now(), no Math.random(), no setTimeout-driven state inside drawing.
 *   - Returns { duration, seek } — contract unchanged.
 *   - Everything synchronous: icons are canvas vector paths, no font loads, no async assets.
 *
 * Visual design: cool-structure + warm-motion two-tone system.
 *   Static/structure: cool blues (#4A5573 connector, #39445E border, gradient node fills).
 *   Motion/active:    warm accent (#FFB35C traveler, active node glow, progress trail fill).
 *   Arrival/done:     teal (#5BD6A8 final node ring + border when complete).
 */
window.__TOUCAN_RENDERER__ = function (stage, spec, theme) {
  "use strict";

  var W = 1280, H = 720;
  var canvas = document.createElement("canvas");
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";
  stage.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // ── resolve theme tokens with sensible fallbacks for old theme shapes ──
  var BG          = theme.background    || "#10131C";
  var NODE_TOP    = theme.nodeFillTop   || theme.nodeFill || "#222C3E";
  var NODE_BOT    = theme.nodeFillBottom|| theme.nodeFill || "#1A2230";
  var NODE_BORDER = theme.nodeBorder    || "#39445E";
  var NODE_TEXT   = theme.nodeText      || "#ECF0F8";
  var MUTED       = theme.mutedText     || "#9CA8C4";
  var CONNECTOR   = theme.connector     || "#4A5573";
  var ACCENT_WARM = theme.accentWarm    || theme.accent || "#FFB35C";
  var ACCENT_DONE = theme.accentDone    || "#5BD6A8";
  var SHADOW      = theme.shadow        || "rgba(0,0,0,0.45)";
  var FONT_SANS   = theme.fontSans      || "system-ui, sans-serif";
  var RADIUS      = theme.radius        || 16;
  var BEAT        = spec.beatDurationMs || theme.beatDurationMs || 900;

  var nodes = spec.nodes;
  var n     = nodes.length;
  var horiz = spec.direction !== "vertical";

  // ── math helpers ──
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t)  { return a + (b - a) * t; }
  function easeInOut(t) { t = clamp(t,0,1); return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  function easeOut(t)   { t = clamp(t,0,1); return 1-Math.pow(1-t,3); }
  function easeOutQ(t)  { t = clamp(t,0,1); return 1-(1-t)*(1-t); }

  // ── color helpers ──
  function parseHex(c) {
    if (!c || c[0] !== "#") return null;
    var h = c.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function blendHex(c1, c2, t) {
    var a = parseHex(c1), b = parseHex(c2);
    if (!a || !b) return t > 0.5 ? c2 : c1;
    return "rgb("+Math.round(lerp(a[0],b[0],t))+","+Math.round(lerp(a[1],b[1],t))+","+Math.round(lerp(a[2],b[2],t))+")";
  }
  function alpha(hex, a) {
    var p = parseHex(hex);
    if (!p) return hex;
    return "rgba("+p[0]+","+p[1]+","+p[2]+","+a+")";
  }

  // ── icon library — synchronous canvas vector paths ──
  // Each fn receives (ctx, cx, cy, size, color) and draws the icon centered at (cx, cy).
  var ICONS = {
    globe: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6; x.fillStyle="none";
      x.beginPath(); x.arc(c.x,c.y,s*.48,0,Math.PI*2); x.stroke();
      x.beginPath(); x.ellipse(c.x,c.y,s*.22,s*.48,0,0,Math.PI*2); x.stroke();
      x.beginPath(); x.moveTo(c.x-s*.48,c.y); x.lineTo(c.x+s*.48,c.y); x.stroke();
    },
    cloud: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var cx=c.x,cy=c.y+s*.08,r=s*.28;
      x.beginPath();
      x.arc(cx-r*.6,cy,r*.6,Math.PI,Math.PI*2);
      x.arc(cx+r*.5,cy-r*.2,r*.45,Math.PI*1.1,Math.PI*2);
      x.arc(cx+r*.9,cy+r*.15,r*.4,Math.PI*1.4,0);
      x.lineTo(cx+r*1.29,cy+r*.45);
      x.arcTo(cx+r*1.29,cy+r*.85,cx-r*1.1,cy+r*.85,r*.4);
      x.lineTo(cx-r*1.1,cy+r*.85);
      x.arc(cx-r*1.1,cy,r*.7,Math.PI*0.5,Math.PI);
      x.closePath(); x.stroke();
    },
    server: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var w=s*.72,h=s*.19,rx=4,by=c.y-s*.28;
      for(var row=0;row<3;row++){
        var ry=by+row*(h+s*.07);
        roundPath(x,c.x-w/2,ry,w,h,rx); x.stroke();
        x.beginPath(); x.arc(c.x-w/2+h*.45,ry+h/2,h*.22,0,Math.PI*2); x.fillStyle=col; x.fill();
      }
    },
    database: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var ew=s*.7,eh=s*.22,top=c.y-s*.4;
      x.beginPath(); x.ellipse(c.x,top,ew/2,eh/2,0,0,Math.PI*2); x.stroke();
      x.beginPath(); x.moveTo(c.x-ew/2,top); x.lineTo(c.x-ew/2,c.y+s*.35);
      x.ellipse(c.x,c.y+s*.35,ew/2,eh/2,0,Math.PI,0,true); x.lineTo(c.x+ew/2,top); x.stroke();
      x.beginPath(); x.moveTo(c.x-ew/2,c.y); x.lineTo(c.x-ew/2,c.y);
      x.ellipse(c.x,c.y,ew/2,eh/2,0,Math.PI,0,true); x.stroke();
    },
    queue: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var w=s*.65,gap=s*.2,h=s*.14,top=c.y-s*.3;
      for(var i=0;i<4;i++){
        var barW=w*(1-i*.12);
        roundPath(x,c.x-barW/2,top+i*(h+gap),barW,h,3); x.stroke();
      }
    },
    page: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var w=s*.55,h=s*.7,fold=s*.18,lx=c.x-w/2,ty=c.y-h/2;
      x.beginPath();
      x.moveTo(lx,ty); x.lineTo(lx+w-fold,ty);
      x.lineTo(lx+w,ty+fold); x.lineTo(lx+w,ty+h);
      x.lineTo(lx,ty+h); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(lx+w-fold,ty); x.lineTo(lx+w-fold,ty+fold); x.lineTo(lx+w,ty+fold); x.stroke();
      for(var l=0;l<3;l++){
        x.beginPath(); x.moveTo(lx+s*.1,ty+s*.22+l*s*.16); x.lineTo(lx+w-s*.1,ty+s*.22+l*s*.16); x.stroke();
      }
    },
    form: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var lx=c.x-s*.38,rx=c.x+s*.38,fields=[c.y-s*.28,c.y,c.y+s*.28];
      fields.forEach(function(fy,fi){
        roundPath(x,lx,fy-s*.1,rx-lx,s*.2,3); x.stroke();
        if(fi===fields.length-1){
          var bx=c.x-s*.18; roundPath(x,bx,fy-s*.08,s*.36,s*.18,4);
          x.fillStyle=col; x.fill();
        }
      });
    },
    mail: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var w=s*.76,h=s*.52,lx=c.x-w/2,ty=c.y-h/2;
      roundPath(x,lx,ty,w,h,4); x.stroke();
      x.beginPath(); x.moveTo(lx,ty); x.lineTo(c.x,c.y+s*.08); x.lineTo(lx+w,ty); x.stroke();
    },
    lock: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var bw=s*.52,bh=s*.44,bx=c.x-bw/2,by=c.y-s*.1;
      roundPath(x,bx,by,bw,bh,4); x.stroke();
      x.beginPath();
      x.arc(c.x,c.y-s*.18,s*.22,Math.PI,0);
      x.lineTo(c.x+s*.22,by); x.moveTo(c.x-s*.22,by); x.lineTo(c.x-s*.22,c.y-s*.18); x.stroke();
      x.beginPath(); x.arc(c.x,c.y+s*.12,s*.09,0,Math.PI*2); x.fillStyle=col; x.fill();
    },
    key: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      x.beginPath(); x.arc(c.x-s*.18,c.y,s*.25,0,Math.PI*2); x.stroke();
      x.beginPath();
      x.moveTo(c.x+s*.04,c.y+s*.08); x.lineTo(c.x+s*.46,c.y+s*.08);
      x.moveTo(c.x+s*.32,c.y+s*.08); x.lineTo(c.x+s*.32,c.y+s*.24);
      x.moveTo(c.x+s*.44,c.y+s*.08); x.lineTo(c.x+s*.44,c.y+s*.2); x.stroke();
    },
    check: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=2.2; x.lineCap="round"; x.lineJoin="round";
      x.beginPath(); x.moveTo(c.x-s*.32,c.y); x.lineTo(c.x-s*.08,c.y+s*.3); x.lineTo(c.x+s*.38,c.y-s*.28); x.stroke();
      x.lineCap="butt"; x.lineJoin="miter";
    },
    user: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      x.beginPath(); x.arc(c.x,c.y-s*.18,s*.24,0,Math.PI*2); x.stroke();
      x.beginPath(); x.arc(c.x,c.y+s*.52,s*.42,Math.PI,0,true); x.stroke();
    },
    users: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.5;
      x.beginPath(); x.arc(c.x-s*.16,c.y-s*.18,s*.2,0,Math.PI*2); x.stroke();
      x.beginPath(); x.arc(c.x-s*.16,c.y+s*.48,s*.35,Math.PI,0,true); x.stroke();
      x.globalAlpha*=.7;
      x.beginPath(); x.arc(c.x+s*.22,c.y-s*.22,s*.18,0,Math.PI*2); x.stroke();
      x.beginPath(); x.arc(c.x+s*.22,c.y+s*.48,s*.3,Math.PI*1.1,0,true); x.stroke();
      x.globalAlpha/=.7;
    },
    shield: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      x.beginPath();
      x.moveTo(c.x,c.y-s*.46); x.lineTo(c.x+s*.38,c.y-s*.24);
      x.lineTo(c.x+s*.38,c.y+s*.08); x.quadraticCurveTo(c.x+s*.38,c.y+s*.42,c.x,c.y+s*.5);
      x.quadraticCurveTo(c.x-s*.38,c.y+s*.42,c.x-s*.38,c.y+s*.08);
      x.lineTo(c.x-s*.38,c.y-s*.24); x.closePath(); x.stroke();
    },
    gear: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.5;
      x.beginPath(); x.arc(c.x,c.y,s*.2,0,Math.PI*2); x.stroke();
      for(var t=0;t<8;t++){
        var a=t*Math.PI/4, r1=s*.32, r2=s*.46;
        x.beginPath();
        x.moveTo(c.x+Math.cos(a)*r1,c.y+Math.sin(a)*r1);
        x.lineTo(c.x+Math.cos(a)*r2,c.y+Math.sin(a)*r2); x.stroke();
      }
    },
    card: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      roundPath(x,c.x-s*.44,c.y-s*.3,s*.88,s*.6,5); x.stroke();
      x.beginPath(); x.moveTo(c.x-s*.44,c.y-s*.06); x.lineTo(c.x+s*.44,c.y-s*.06); x.stroke();
      roundPath(x,c.x-s*.34,c.y+s*.04,s*.22,s*.14,3); x.fillStyle=col; x.fill();
    },
    money: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      roundPath(x,c.x-s*.44,c.y-s*.32,s*.88,s*.64,5); x.stroke();
      x.beginPath(); x.arc(c.x,c.y,s*.22,0,Math.PI*2); x.stroke();
      x.font="bold "+(s*.28)+"px sans-serif"; x.fillStyle=col; x.textAlign="center"; x.textBaseline="middle";
      x.fillText("$",c.x,c.y+s*.02);
    },
    api: function(x,c,s,col){
      x.fillStyle=col; x.font="600 "+(s*.28)+"px sans-serif"; x.textAlign="center"; x.textBaseline="middle";
      x.fillText("API",c.x,c.y);
    },
    search: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.8;
      x.beginPath(); x.arc(c.x-s*.1,c.y-s*.08,s*.28,0,Math.PI*2); x.stroke();
      x.beginPath(); x.moveTo(c.x+s*.12,c.y+s*.14); x.lineTo(c.x+s*.4,c.y+s*.42); x.stroke();
    },
    bell: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      x.beginPath();
      x.moveTo(c.x-s*.04,c.y-s*.45);
      x.arc(c.x,c.y-s*.08,s*.36,Math.PI*1.2,Math.PI*1.8,false);
      // body arc is drawn implicitly; close at bottom
      x.lineTo(c.x+s*.4,c.y+s*.28); x.lineTo(c.x-s*.4,c.y+s*.28); x.closePath(); x.stroke();
      x.beginPath(); x.arc(c.x,c.y+s*.42,s*.1,0,Math.PI*2); x.stroke();
    },
    code: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=2; x.lineCap="round"; x.lineJoin="round";
      x.beginPath(); x.moveTo(c.x-s*.18,c.y-s*.28); x.lineTo(c.x-s*.44,c.y); x.lineTo(c.x-s*.18,c.y+s*.28); x.stroke();
      x.beginPath(); x.moveTo(c.x+s*.18,c.y-s*.28); x.lineTo(c.x+s*.44,c.y); x.lineTo(c.x+s*.18,c.y+s*.28); x.stroke();
      x.lineCap="butt"; x.lineJoin="miter";
    },
    terminal: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      roundPath(x,c.x-s*.46,c.y-s*.34,s*.92,s*.68,5); x.stroke();
      x.beginPath(); x.moveTo(c.x-s*.32,c.y-s*.1); x.lineTo(c.x-s*.12,c.y+s*.08); x.lineTo(c.x-s*.32,c.y+s*.26);
      x.moveTo(c.x-s*.04,c.y+s*.26); x.lineTo(c.x+s*.26,c.y+s*.26); x.stroke();
    },
    mobile: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      roundPath(x,c.x-s*.22,c.y-s*.44,s*.44,s*.88,7); x.stroke();
      x.beginPath(); x.arc(c.x,c.y+s*.32,s*.05,0,Math.PI*2); x.fillStyle=col; x.fill();
    },
    cart: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      x.beginPath();
      x.moveTo(c.x-s*.48,c.y-s*.28);
      x.lineTo(c.x-s*.32,c.y-s*.28);
      x.lineTo(c.x-s*.14,c.y+s*.2);
      x.lineTo(c.x+s*.38,c.y+s*.2);
      x.lineTo(c.x+s*.44,c.y-s*.12);
      x.lineTo(c.x-s*.24,c.y-s*.12); x.stroke();
      x.beginPath(); x.arc(c.x-s*.08,c.y+s*.36,s*.1,0,Math.PI*2); x.fillStyle=col; x.fill();
      x.beginPath(); x.arc(c.x+s*.3,c.y+s*.36,s*.1,0,Math.PI*2); x.fillStyle=col; x.fill();
    },
    send: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6; x.fillStyle=col;
      x.beginPath();
      x.moveTo(c.x-s*.44,c.y+s*.3);
      x.lineTo(c.x+s*.44,c.y);
      x.lineTo(c.x-s*.44,c.y-s*.3);
      x.lineTo(c.x-s*.18,c.y); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(c.x-s*.18,c.y); x.lineTo(c.x-s*.02,c.y+s*.28); x.stroke();
    },
    clock: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      x.beginPath(); x.arc(c.x,c.y,s*.42,0,Math.PI*2); x.stroke();
      x.beginPath(); x.moveTo(c.x,c.y); x.lineTo(c.x,c.y-s*.28); x.moveTo(c.x,c.y); x.lineTo(c.x+s*.2,c.y+s*.1); x.stroke();
    },
    doc: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var w=s*.58,h=s*.72,fold=s*.17,lx=c.x-w/2,ty=c.y-h/2;
      x.beginPath();
      x.moveTo(lx,ty); x.lineTo(lx+w-fold,ty);
      x.lineTo(lx+w,ty+fold); x.lineTo(lx+w,ty+h);
      x.lineTo(lx,ty+h); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(lx+w-fold,ty); x.lineTo(lx+w-fold,ty+fold); x.lineTo(lx+w,ty+fold); x.stroke();
      for(var l=0;l<4;l++){
        x.beginPath(); x.moveTo(lx+s*.1,ty+s*.18+l*s*.15); x.lineTo(lx+w-s*.1,ty+s*.18+l*s*.15); x.stroke();
      }
    },
    chart: function(x,c,s,col){
      x.strokeStyle=col; x.lineWidth=1.6;
      var lx=c.x-s*.38,by=c.y+s*.32;
      x.beginPath(); x.moveTo(lx,c.y-s*.38); x.lineTo(lx,by); x.lineTo(c.x+s*.42,by); x.stroke();
      var bars=[[s*.1,s*.3],[s*.22,s*.5],[s*.34,s*.2],[s*.46,s*.42]];
      bars.forEach(function(b){
        x.beginPath(); x.rect(lx+b[0]*s,by-b[1]*s,s*.1,b[1]*s); x.fillStyle=col; x.fill();
      });
    },
  };

  // fallback neutral ring for unknown icons
  function drawIconFallback(cx, cy, size, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2); ctx.stroke();
  }

  function drawIcon(name, cx, cy, size, color) {
    var fn = ICONS[name];
    ctx.save();
    if (fn) { fn(ctx, { x: cx, y: cy }, size, color); }
    else     { drawIconFallback(cx, cy, size, color); }
    ctx.restore();
  }

  // helper for icons that need rounded rects
  function roundPath(x, rx, ry, rw, rh, r) {
    r = Math.min(r, rw/2, rh/2);
    x.beginPath();
    x.moveTo(rx+r, ry);
    x.arcTo(rx+rw,ry,rx+rw,ry+rh,r);
    x.arcTo(rx+rw,ry+rh,rx,ry+rh,r);
    x.arcTo(rx,ry+rh,rx,ry,r);
    x.arcTo(rx,ry,rx+rw,ry,r);
    x.closePath();
  }

  // ── text measurement & wrapping ──
  function setLabelFont(size) {
    ctx.font = "600 " + size + "px " + FONT_SANS;
  }
  function setSublabelFont() {
    ctx.font = "400 13px " + FONT_SANS;
  }
  function wrapText(text, maxW) {
    // Returns an array of ≤2 lines.
    var words = text.split(" ");
    var lines = [];
    var cur = "";
    for (var i = 0; i < words.length; i++) {
      var next = cur ? cur + " " + words[i] : words[i];
      if (ctx.measureText(next).width <= maxW) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        cur = words[i];
        if (lines.length >= 1) { cur = words.slice(i).join(" "); break; } // 2nd line gets the rest
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  }

  // ── layout: compute nodeW / nodeH to content, then fit to canvas ──
  var LABEL_FONT_BASE = 18;  // start here, may scale down
  var PAD = 22;
  var ICON_SIZE = 26;
  var BADGE_H = 22;

  // Measure max label width across all nodes to set a consistent nodeW.
  // We allow up to 2 lines, so the layout column needs the longest single wrapped line.
  function measureNodes(labelFontSize) {
    setLabelFont(labelFontSize);
    var maxW = 0;
    nodes.forEach(function (nd) {
      var lines = wrapText(nd.label, 999); // wrap without constraint first
      lines.forEach(function (l) { maxW = Math.max(maxW, ctx.measureText(l).width); });
      if (nd.sublabel) {
        setSublabelFont();
        maxW = Math.max(maxW, ctx.measureText(nd.sublabel).width);
        setLabelFont(labelFontSize);
      }
    });
    return maxW;
  }

  var labelFontSize = LABEL_FONT_BASE;
  var nodeW, nodeH, GAP;
  // Global layout flags — all nodes use the same nodeH so the row is uniform.
  var hasAnyIcon = nodes.some(function(nd){ return nd.icon; });
  var hasAnySub  = nodes.some(function(nd){ return nd.sublabel; });

  (function computeLayout() {
    var hasIcon = hasAnyIcon;
    var hasSub  = hasAnySub;

    // nodeH: icon row + label lines (up to 2) + sublabel + step badge
    var iconRow   = hasIcon ? ICON_SIZE + 10 : 0;
    var labelRows = 2; // reserve 2 rows; we'll fit them
    var subRow    = hasSub ? 17 : 0;
    nodeH = iconRow + labelRows * (labelFontSize + 6) + subRow + BADGE_H + PAD * 1.6;
    nodeH = Math.round(nodeH);

    // nodeW: content-driven, clamped 168–264
    var maxLabelW = measureNodes(labelFontSize);
    nodeW = clamp(Math.round(maxLabelW + PAD * 2), 168, 264);

    // Gap: start generous, shrink to min 44 if needed
    if (horiz) {
      var usable = W - 100;  // 50px margin each side
      var needed = n * nodeW;
      var availGap = (usable - needed) / (n - 1);
      GAP = clamp(availGap, 44, 80);

      // If still too wide, scale font down (floor 0.82×) until it fits
      if (needed + GAP * (n - 1) > usable) {
        var minFont = Math.floor(labelFontSize * 0.82);
        while (labelFontSize > minFont) {
          labelFontSize--;
          var newMax = measureNodes(labelFontSize);
          nodeW = clamp(Math.round(newMax + PAD * 2), 168, 264);
          needed = n * nodeW;
          availGap = (usable - needed) / (n - 1);
          GAP = clamp(availGap, 44, 80);
          if (needed + GAP * (n - 1) <= usable) break;
        }
      }
    } else {
      GAP = 36;
    }
  })();

  // ── centers ──
  var centers = [];
  // Header block: eyebrow 32px, title 40px, plus some padding
  var HEADER_H = spec.title ? 120 : 60;

  if (horiz) {
    var totalRowW = n * nodeW + (n - 1) * GAP;
    var rowLeft   = (W - totalRowW) / 2;
    var cy = HEADER_H + (H - HEADER_H - nodeH) / 2 + nodeH / 2;
    for (var i = 0; i < n; i++) {
      centers.push({ x: rowLeft + nodeW / 2 + i * (nodeW + GAP), y: cy });
    }
  } else {
    var totalColH = n * nodeH + (n - 1) * GAP;
    var colTop    = HEADER_H + (H - HEADER_H - totalColH) / 2;
    var cxV       = W / 2;
    for (var j = 0; j < n; j++) {
      centers.push({ x: cxV, y: colTop + nodeH / 2 + j * (nodeH + GAP) });
    }
  }

  // ── timeline (same structure as before) ──
  var introStagger = BEAT * 0.28;
  var nodeInDur    = BEAT * 0.55;
  var introEnd     = (n - 1) * introStagger + nodeInDur;
  var settle       = BEAT * 0.30;
  var travelStart  = introEnd + settle;
  var arrival      = [];
  for (var k = 0; k < n; k++) arrival.push(travelStart + k * BEAT);
  var travelEnd = arrival[n - 1];
  var outroDur  = BEAT * 1.6;
  var tailHold  = BEAT * 0.6;
  var duration  = travelEnd + outroDur + tailHold;

  function nodeAppearAt(i) { return i * introStagger; }
  function nodeReveal(i, t) { return easeOut(clamp((t - nodeAppearAt(i)) / nodeInDur, 0, 1)); }

  var ramp = BEAT * 0.22;
  function nodeActive(i, t) {
    if (t < travelStart) return 0;
    var rise = clamp((t - (arrival[i] - ramp)) / ramp, 0, 1);
    var fall = 1;
    if (i < n - 1) fall = 1 - clamp((t - (arrival[i + 1] - ramp)) / ramp, 0, 1);
    return Math.min(rise, fall);
  }
  function nodeDone(i, t) {
    // node i is "done" (traveler has left) once arrival[i+1] is passed
    if (i >= n - 1) {
      return t >= travelEnd ? clamp((t - travelEnd) / (outroDur * 0.4), 0, 1) : 0;
    }
    return clamp((t - arrival[i + 1]) / ramp, 0, 1);
  }

  // ── drawing helpers ──
  function roundRect(rx, ry, rw, rh, r) {
    roundPath(ctx, rx, ry, rw, rh, r);
  }

  function nodeRect(i) {
    var c = centers[i];
    return { x: c.x - nodeW / 2, y: c.y - nodeH / 2, w: nodeW, h: nodeH };
  }

  function edge(i, towardNext) {
    var r = nodeRect(i);
    if (horiz) { return { x: towardNext ? r.x + r.w : r.x, y: r.y + r.h / 2 }; }
    return { x: r.x + r.w / 2, y: towardNext ? r.y + r.h : r.y };
  }

  // ── connectors ──
  // Progress trail: segment i is fully lit in accentWarm once the traveler has passed (done), and
  // partially lit while in transit. This makes the path fill up as the story completes.
  function drawConnector(i, t) {
    var a = edge(i, true), b = edge(i + 1, false);
    var drawP = easeOut(clamp((t - nodeAppearAt(i + 1)) / (BEAT * 0.5), 0, 1));
    if (drawP <= 0) return;
    var ex = lerp(a.x, b.x, drawP), ey = lerp(a.y, b.y, drawP);

    // Track (cool, always drawn)
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = CONNECTOR;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();

    // Progress fill: warm color
    var fillFrac = 0;
    var doneAmt = nodeDone(i, t);
    if (doneAmt > 0) {
      // fully done segment
      fillFrac = drawP; // fill to wherever track has drawn
    } else if (t >= arrival[i] && t < arrival[i + 1]) {
      // traveler in transit on this segment
      fillFrac = easeInOut(clamp(((t - arrival[i]) / BEAT - 0.12) / 0.80, 0, 1)) * drawP;
    }
    if (fillFrac > 0.01) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = ACCENT_WARM;
      if (doneAmt > 0) ctx.strokeStyle = alpha(ACCENT_WARM, lerp(0.55, 0.9, doneAmt));
      ctx.shadowColor = ACCENT_WARM;
      ctx.shadowBlur  = doneAmt > 0 ? 8 : 14;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(lerp(a.x, b.x, fillFrac), lerp(a.y, b.y, fillFrac));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Arrowhead (drawn in connector color, at far end once track is full)
    if (drawP > 0.98) {
      var ang = Math.atan2(b.y - a.y, b.x - a.x);
      var as  = 13;
      // warm if done, cool otherwise
      ctx.fillStyle = doneAmt > 0.5 ? alpha(ACCENT_WARM, 0.85) : CONNECTOR;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - as*Math.cos(ang-0.38), b.y - as*Math.sin(ang-0.38));
      ctx.lineTo(b.x - as*Math.cos(ang+0.38), b.y - as*Math.sin(ang+0.38));
      ctx.closePath(); ctx.fill();
    }
  }

  // ── nodes ──
  function drawNode(i, t) {
    var reveal = nodeReveal(i, t);
    if (reveal <= 0) return;
    var active = nodeActive(i, t);
    var done   = nodeDone(i, t);
    var nd     = nodes[i];
    var c      = centers[i];
    var r      = nodeRect(i);
    var isFinal = (i === n - 1);

    // outro ring + done color on final node
    var ringScale = 0, ringAlpha = 0;
    if (isFinal && t >= travelEnd) {
      var op = clamp((t - travelEnd) / outroDur, 0, 1);
      ringScale = easeOutQ(Math.min(op * 2.5, 1));
      ringAlpha = Math.max(0, 1 - op * 1.6);
    }

    var scale = lerp(0.86, 1, reveal) + active * 0.035;
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.translate(c.x, c.y); ctx.scale(scale, scale); ctx.translate(-c.x, -c.y);

    // drop shadow
    ctx.shadowColor  = SHADOW;
    ctx.shadowBlur   = 28;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;

    // node fill — vertical gradient
    var grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    grad.addColorStop(0, NODE_TOP);
    grad.addColorStop(1, NODE_BOT);
    roundRect(r.x, r.y, r.w, r.h, RADIUS);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // active glow overlay when in motion
    if (active > 0.02) {
      ctx.shadowColor = ACCENT_WARM;
      ctx.shadowBlur  = 32 * active;
      roundRect(r.x, r.y, r.w, r.h, RADIUS);
      ctx.fillStyle = alpha(ACCENT_WARM, 0.06 * active);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // border: cool → warm (active) → done (teal)
    roundRect(r.x, r.y, r.w, r.h, RADIUS);
    var borderColor = NODE_BORDER;
    if (active > 0.02) borderColor = blendHex(NODE_BORDER, ACCENT_WARM, active);
    if (isFinal && done > 0.3) borderColor = blendHex(borderColor, ACCENT_DONE, Math.min(done * 1.4, 1));
    ctx.lineWidth   = active > 0.02 ? 2.5 : 1.8;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    // outro expanding ring (final node)
    if (ringAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= ringAlpha;
      ctx.strokeStyle  = ACCENT_DONE;
      ctx.lineWidth    = 2;
      ctx.shadowColor  = ACCENT_DONE;
      ctx.shadowBlur   = 18;
      ctx.translate(c.x, c.y); ctx.scale(1 + ringScale * 0.22, 1 + ringScale * 0.22); ctx.translate(-c.x, -c.y);
      roundRect(r.x, r.y, r.w, r.h, RADIUS);
      ctx.stroke();
      ctx.restore();
    }

    // ── content layout inside node ──
    // Use global flags so all nodes share the same nodeH and content is uniformly vertically placed.
    setLabelFont(labelFontSize);
    var labelLines = wrapText(nd.label, r.w - PAD * 2);
    var lineH      = labelFontSize + 6;

    var iconAreaH  = hasAnyIcon ? ICON_SIZE + 8 : 0;
    var labelAreaH = labelLines.length * lineH;
    var subAreaH   = hasAnySub ? 17 : 0;
    var badgeAreaH = BADGE_H;
    var totalContentH = iconAreaH + labelAreaH + subAreaH + badgeAreaH;
    var contentTop = c.y - totalContentH / 2 + 4;

    var curY = contentTop;

    // icon (always drawn if any node in the flow has icons; fallback ring for nodes without one)
    if (hasAnyIcon) {
      var iconColor = active > 0.3
        ? blendHex(NODE_TEXT, ACCENT_WARM, active)
        : (isFinal && done > 0.5 ? ACCENT_DONE : NODE_TEXT);
      drawIcon(nd.icon || "", c.x, curY + ICON_SIZE / 2, ICON_SIZE, iconColor);
      curY += iconAreaH;
    }

    // label lines
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = NODE_TEXT;
    setLabelFont(labelFontSize);
    labelLines.forEach(function (line) {
      ctx.fillText(line, c.x, curY);
      curY += lineH;
    });

    // sublabel (always reserve space if any node has one)
    if (hasAnySub) {
      setSublabelFont();
      ctx.fillStyle = nd.sublabel ? MUTED : "transparent";
      if (nd.sublabel) ctx.fillText(nd.sublabel, c.x, curY);
      curY += subAreaH;
    }

    // step badge
    var badge = String(i + 1).padStart(2, "0");
    ctx.font = "500 11px " + FONT_SANS;
    ctx.fillStyle = active > 0.2
      ? alpha(ACCENT_WARM, 0.75)
      : (done > 0.5 && isFinal ? alpha(ACCENT_DONE, 0.7) : alpha(MUTED, 0.55));
    ctx.fillText(badge, c.x, curY + (BADGE_H - 14) / 2);

    ctx.restore();
  }

  // ── traveler ──
  function drawTraveler(t) {
    if (t < arrival[0]) return;
    if (t >= travelEnd) return; // tucked away after final arrival

    var ki = clamp(Math.floor((t - travelStart) / BEAT), 0, n - 2);
    var a  = edge(ki, true), b = edge(ki + 1, false);
    var hp = easeInOut(clamp(((t - arrival[ki]) / BEAT - 0.12) / 0.80, 0, 1));
    var px = lerp(a.x, b.x, hp), py = lerp(a.y, b.y, hp);

    // comet trail (3 fading dots behind)
    var trailCount = 3;
    for (var tr = trailCount; tr >= 1; tr--) {
      var tBack  = Math.max(0, hp - tr * 0.07);
      var trailX = lerp(a.x, b.x, tBack), trailY = lerp(a.y, b.y, tBack);
      ctx.save();
      ctx.globalAlpha = (1 - tr / (trailCount + 1)) * 0.45;
      ctx.fillStyle   = ACCENT_WARM;
      ctx.beginPath(); ctx.arc(trailX, trailY, 9 - tr * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // main dot + glow
    ctx.save();
    ctx.shadowColor = ACCENT_WARM; ctx.shadowBlur = 28;
    ctx.fillStyle   = ACCENT_WARM;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // traveler label
    if (spec.traveler && spec.traveler.label) {
      ctx.fillStyle    = ACCENT_WARM;
      ctx.font         = "500 12px " + FONT_SANS;
      ctx.textAlign    = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(spec.traveler.label, px, py - 17);
    }
  }

  // ── header ──
  function drawHeader() {
    // faint dot-grid background
    var dotSpacing = 36, dotR = 1.2;
    ctx.fillStyle = alpha(NODE_BORDER, 0.06);
    for (var gx = dotSpacing / 2; gx < W; gx += dotSpacing) {
      for (var gy = dotSpacing / 2; gy < H; gy += dotSpacing) {
        ctx.beginPath(); ctx.arc(gx, gy, dotR, 0, Math.PI * 2); ctx.fill();
      }
    }

    // background gradient (top → bottom, subtle)
    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, BG);
    bgGrad.addColorStop(1, alpha("#0B0E15", 1));
    ctx.fillStyle = bgGrad;
    // We draw behind everything, but clearRect already wiped to transparent — fill the whole canvas.
    // Actually we want the bg UNDER the dots and everything else, so draw it first in seek().

    if (!spec.title) return;

    // eyebrow
    var stepWord = n === 1 ? "1 STEP" : n + " STEPS";
    ctx.font         = "600 11px " + FONT_SANS;
    ctx.fillStyle    = alpha(MUTED, 0.7);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0.14em"; // may be ignored in older browsers; harmless
    ctx.fillText(("FLOW  ·  " + stepWord).toUpperCase(), W / 2, 38);
    ctx.letterSpacing = "0px";

    // title
    ctx.font         = "700 40px " + FONT_SANS;
    ctx.fillStyle    = NODE_TEXT;
    ctx.textBaseline = "middle";
    // single-line fit
    var maxTitleW = W - 200;
    var title = spec.title;
    while (ctx.measureText(title).width > maxTitleW && title.length > 4) {
      title = title.slice(0, -2).replace(/\s*$/, "") + "…";
    }
    ctx.fillText(title, W / 2, 80);
  }

  // ── seek (pure function of t) ──
  function seek(t) {
    ctx.clearRect(0, 0, W, H);

    // background
    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, BG);
    bgGrad.addColorStop(1, "#0B0E15");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    drawHeader();

    // connectors (draw behind nodes)
    for (var ci = 0; ci < n - 1; ci++) drawConnector(ci, t);
    // nodes
    for (var ni = 0; ni < n; ni++) drawNode(ni, t);
    // traveler (draw on top)
    drawTraveler(t);
  }

  return { duration: duration, seek: seek };
};
