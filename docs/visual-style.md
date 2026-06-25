# Toucan — Visual Style Spec (v0.1)

> **This is the art-direction contract for Section 3.** The Remotion kit is built
> *to* this document. Do not improvise the visual language; if something here is
> ambiguous, ask rather than guess. Every value is concrete on purpose.
>
> All values are authored for a **1920×1080** stage. Timings are given in
> **milliseconds** (canonical, fps-independent) with the frame count at 30fps in
> parentheses; the renderer converts ms → frames via the composition fps.

---

## 0. North star

A Toucan explainer should read like a calm, confident, high-production
"how it works" video — the Fern / MagnatesMedia lane: **high contrast, generous
whitespace, restrained palette, smooth eased motion, legibility first.** It must
never look like a flowchart tool or a CodePen demo.

The visual system is **two-tone with a status color**:

- **Cool = structure.** Idle nodes, connectors, the stage. Calm, recessive.
- **Warm = motion.** Anything happening *right now* — a traveling packet, an
  active node, a freshly drawn edge. The warm accent is the viewer's eye magnet.
- **Teal = done.** Success / completion. A quiet, satisfying resolution color.
- **Coral = error.** Used sparingly.

At any moment the viewer's eye should land on the single warm thing. If two warm
things compete, the composition is wrong.

---

## 1. Stage, grid, safe area

| Property | Value |
|---|---|
| Stage | 1920 × 1080 (16:9) |
| Render output (v0.1) | 1080p, H.264 |
| FPS | 30 (build) → 60 (polish-stage option; timings below hold either way) |
| Grid base unit | 8 px |
| Spacing scale | 8 / 16 / 24 / 32 / 48 / 64 / 96 / 128 |
| Safe margin (content keep-out) | 96 px all sides → live area 1728 × 888 |
| Background | never pure black; uses `bg/base` token |

All positions come from auto-layout + the aesthetic-normalization pass (§7). No
hand-placed or AI-supplied coordinates, ever.

---

## 2. Color tokens (default theme: "Midnight")

Semantic roles are fixed. The **default** hex values are below; `themeParams`
(§9) may shift a small subset, but the *roles* never change.

### Backgrounds (cool, recessive)
| Token | Hex | Use |
|---|---|---|
| `bg/base` | `#0E1118` | stage background (deep navy-black, not #000) |
| `bg/surface` | `#161B26` | panels, edge-label pills, code editor body |
| `bg/elevated` | `#1E2536` | modals, raised cards |

### Structure (cool)
| Token | Hex | Use |
|---|---|---|
| `node/fill` | `#1E2A3C` | idle node body |
| `node/fill-top` | `#232F44` | subtle top of node gradient |
| `node/fill-bottom` | `#1A2434` | subtle bottom of node gradient |
| `node/border` | `#3A4763` | idle node border (2 px) |
| `connector` | `#45516E` | idle edges (3 px) |

### Text
| Token | Hex | Use |
|---|---|---|
| `text/primary` | `#ECF0F8` | node labels, titles (off-white, not #FFF) |
| `text/muted` | `#9AA6C2` | sublabels, secondary text |
| `text/on-accent` | `#0E1118` | text/glyphs sitting on a warm or teal fill |

### Accents (semantic)
| Token | Hex | Role |
|---|---|---|
| `motion/warm` | `#FFB25C` | **THE motion color** — packets, active state, progress trail |
| `motion/warm-soft` | `rgba(255,178,92,0.16)` | warm glow halos / rings |
| `focus/cool` | `#4CC2FF` | highlight rings, attention pings (cool, distinct from motion) |
| `focus/cool-soft` | `rgba(76,194,255,0.16)` | cool glow |
| `done/teal` | `#54D6A6` | success state, completion |
| `done/teal-soft` | `rgba(84,214,166,0.16)` | success glow |
| `error/coral` | `#FF6B6B` | error state (soft coral, never harsh red) |

**Rules:** never fully saturated primaries; never neon. Glows are *soft and
low-opacity*, never bright halos. One warm focus on screen at a time.

---

## 3. Typography

| | Family | Notes |
|---|---|---|
| Sans (default) | **Inter** | via `@remotion/google-fonts/Inter`, bundled — no runtime font fetch at render |
| Mono | **JetBrains Mono** | code editor element |

Type scale (at 1080p):

| Style | Size / Weight / Line-height / Tracking | Use |
|---|---|---|
| Title | 56 / 600 / 1.1 / −0.02em | scene/topic title |
| Node label | 28 / 600 / 1.2 / 0 | primary node name |
| Node sublabel | 18 / 400 / 1.3 / 0 · `text/muted` | secondary line |
| Edge label | 20 / 500 / 1.2 / 0 | the pill on a traveling packet |
| Annotation | 24 / 500 / 1.3 / 0 | callouts pointing at things |
| Counter | 88 / 700 / 1.0 · **tabular-nums** | big stat reveals (topic 10) |
| Code | 22 / 400 / 1.5 mono | code editor lines |

Legibility is non-negotiable: minimum on-screen text 18 px; contrast ≥ WCAG AA
against its background; labels never overlap edges or each other (enforced by §7).

---

## 4. Shape & line language

| Element | Spec |
|---|---|
| Node corner radius | 20 px |
| Node default size | 240 × 120 (min 200 × 96), 24 px internal padding |
| Node icon | 40 px, left of label, `text/muted` when idle |
| Node border | 2 px idle → 2.5 px when active/success/error |
| Connector / edge | 3 px, rounded caps, routed by layout |
| Arrowhead | filled triangle, 14 px, same color as its edge |
| Edge label pill | `bg/surface`, 10 px radius, 8×16 padding |
| Packet (data dot) | 20 px diameter, `motion/warm`, soft `motion/warm-soft` halo (~40 px) |
| Focus ring | 3 px, offset 8 px outside element bounds |
| Badge (check/error glyph) | 28 px circle at node top-right corner |

Node fill is a **subtle** vertical gradient (`fill-top` → `fill-bottom`) — barely
perceptible, just enough to lift it off the background. No drop-shadow soup; at
most one soft, low-opacity ambient shadow per node.

---

## 5. Motion system

### Easing curves
| Name | Curve | Use |
|---|---|---|
| `ease-out-soft` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | entrances, edge draw |
| `ease-in-out` | `cubic-bezier(0.45, 0, 0.55, 1)` | camera moves, packet travel |
| `ease-emphasis` | `cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot) | pops, arrival pulses |

Prefer Remotion `spring()` for organic pops (active-state scale, arrival ping);
use the bezier curves for travel/camera/entrance.

### Standard durations
| Name | ms | frames@30 |
|---|---|---|
| micro | 120 | 4 |
| fast | 200 | 6 |
| base | 320 | 10 |
| slow | 600 | 18 |
| **beat** (one logical step / default packet travel) | 900 | 27 |
| camera move | 600 | 18 |

**Rules:** nothing ever appears or disappears instantly — every entrance/exit is
≥ 200 ms. Motion is always eased, never linear (the only exception: continuous
loops like the processing ring). Motion blur is **deferred to the polish stage**;
do not implement it in v0.1.

---

## 6. Verb definitions (frame by frame)

These are the closed-vocabulary timeline verbs. Each is a **pure function of
frame** — same spec + theme → pixel-identical output. No `Date.now`, no random.

### `appear` (element entrance)
- opacity 0 → 1 over **base (320 ms)**, `ease-out-soft`
- scale 0.96 → 1.0, same duration/curve
- translateY +12 px → 0, same
- If several elements `appear` on the same beat, **stagger 80 ms** each in
  reading order.

### `edge.draw`
- The path strokes in from `from` → `to`: dash offset full → 0 over
  **slow (600 ms)** wait — use **base+ (400 ms)**, `ease-out-soft`.
- Idle edge color = `connector`, 3 px.
- Arrowhead fades + scales (0.8 → 1) in over the final **micro (120 ms)**.

### `camera.focus` (target)
- Compute target center + a zoom **scale 1.35** such that the target and its
  immediate neighbors stay within the safe area.
- Ease the stage transform (translate + scale) to that over **camera (600 ms)**,
  `ease-in-out`.
- `camera.focus` does **not** dim by itself (that's the `dim` verb). Combine
  `camera.focus` + `dim` for a strong spotlight.
- `camera.zoom` (scale arg) and `camera.reset` (back to scale 1.0, centered) use
  the same 600 ms `ease-in-out`.

### `packet.travel` (edge)  ← the signature motion
1. A **packet** (20 px dot, `motion/warm`, soft `motion/warm-soft` halo) departs
   `edge.from` and moves along the routed path to `edge.to` over **one beat
   (900 ms default)**, `ease-in-out`. A `speed` arg scales the duration.
2. **Progress trail:** the portion of the edge already traversed recolors
   `connector` → `motion/warm` behind the packet — the "energy flowing" effect.
3. **Optional label:** if `args.label` is set, an edge-label pill fades in over
   the first **fast (200 ms)**, rides near the packet (or sits at the edge
   midpoint), and fades out over the final **fast (200 ms)**.
4. **Arrival:** on reaching `to`, emit a single pulse ring from the target node
   (`ease-emphasis`, **base 320 ms**, scale 1.0 → 1.4, opacity 1 → 0).
5. After travel, the warm trail fades back to `connector` over **base (320 ms)**
   *unless* the flow is meant to stay lit (explicit arg). Default: fades.

The destination going "active" is a **separate** `node.state` action the director
sequences right after — don't bake it into `packet.travel`.

### `node.state` (target, state) — cross-fade 250 ms between states
- **idle:** `node/fill` gradient, `node/border` (2 px), label `text/primary`,
  sublabel `text/muted`. No glow.
- **active:** border → `motion/warm` (2.5 px) + soft warm ring
  (`motion/warm-soft`). On entry, a one-shot scale 1.0 → 1.03 → 1.0
  (`ease-emphasis`, **fast 200 ms**) "pop."
- **processing:** border warm + a **looping** ring: scale 1.0 → 1.15 with opacity
  0.6 → 0, period **1200 ms**, linear loop (the one allowed linear motion).
  Signals "working."
- **success:** border → `done/teal` (2.5 px); a check glyph pops into the
  top-right badge (`ease-emphasis`, **base 320 ms**); one quiet teal glow pulse.
- **error:** border → `error/coral`; a subtle shake (translateX ±6 px, 3
  oscillations over **base 320 ms**) + error glyph badge. Use sparingly.

### `highlight` (target)
- A **focus ring** (3 px, `focus/cool`, offset 8 px outside bounds) appears: scale
  1.0 → 1.06 + opacity 0 → 1 over **fast (200 ms)**.
- It then **gently pulses** for the action's `duration`: scale 1.06 ↔ 1.10,
  opacity 1.0 ↔ 0.6, period **1000 ms**.
- For a one-shot attention "ping" (no sustain), use the arrival-pulse pattern
  instead (ring scales 1.0 → 1.4 while fading 1 → 0 over **slow 600 ms**).

### `dim` (except: id[])
- All elements **not** in `except` drop to **35 % opacity** over **base (320 ms)**,
  `ease-out-soft`; they restore over **base (320 ms)** when the dim ends.
- `camera.focus` + `dim(except: [target])` = the strong spotlight combination.

### `label.show` / annotations
- Appears via `appear` semantics. A callout annotation may draw a **leader line**
  to its `attachTo` target (same as `edge.draw`, **base 320 ms**) before the text
  fades in.

### Extensions (defined later, when Section 6 needs them — do NOT build in §3)
- **funnel** shape + **`counter`** verb (count-up of a number, `ease-out`,
  **800 ms**, tabular figures). Specced when topic 10 is built. Flag, don't guess.

---

## 7. Layout & composition (the anti-"auto-generated" pass)

Raw `dagre` output looks machine-placed; that is the single biggest cheapness
risk. After raw layout, apply a **deterministic aesthetic-normalization pass**:

- **Center** the whole graph's bounding box within the live area (1728 × 888).
- **Equalize** spacing: enforce a **minimum 120 px horizontal / 80 px vertical**
  gap between node bounding boxes; distribute evenly rather than leaving dagre's
  uneven gaps.
- **Breathing room:** never let content touch the 96 px safe margin.
- **Snap** node centers to the 8 px grid.
- **Clearance:** labels and edge pills must not overlap nodes, edges, or each
  other — nudge or reroute until clear.
- **Density cap:** at most ~6 primary nodes on screen. Beyond that the director
  should split into scenes (flag if a fixture exceeds this).

Determinism is mandatory here too: same graph → byte-identical positions.

---

## 8. Quality bar (the "not cheap" checklist)

A frame fails review if any of these is violated:

- Pure black or pure white anywhere (use the tokens).
- Fully saturated / neon colors, or a bright glow halo.
- Anything appears, moves, or disappears without an eased transition.
- More than one warm "focus" competing for the eye at once (unintentionally).
- Cramped spacing / content near the safe margin / overlapping labels.
- Inconsistent stroke weights or corner radii outside the tokens above.
- Text below 18 px or under AA contrast.
- A linear-motion ease on anything other than a continuous loop.

When in doubt: more whitespace, slower easing, fewer things on screen.

---

## 9. Theme params (what the user controls — the source of variety)

Variety between generations comes from **here and from layout**, never from
loosening spec generation. The director must **not** emit `themeParams`; the user
(or a default) sets them, and the renderer maps them to tokens.

| Param | Options (v0.1) | Effect |
|---|---|---|
| `palette` | `midnight` (default) · `slate` · `ink-indigo` | shifts the **cool structure** hue family (bg + node + connector); accents unchanged |
| `accent` | hex (default `#FFB25C`) | sets `motion/warm` (and derives `motion/warm-soft`) |
| `font` | `inter` (default) · `geist` · `system` | swaps the sans family |

The semantic roles, motion timings, easing, shape language, and quality bar are
**constant** across all theme params. This is what guarantees the output looks
*different* each time (color/font) while never looking *inconsistent* or broken.

---

## 10. Determinism contract (carries the project rule)

Every visual is a pure function of the frame index. No `Date.now()`, no
`Math.random()`, no wall-clock timing. Same `SceneSpec` + same `themeParams` →
identical frames on every render. This is what makes the live `@remotion/player`
preview match the headless MP4 exactly.
