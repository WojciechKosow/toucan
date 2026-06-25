// Design tokens — the single source of the visual language, transcribed from
// docs/visual-style.md (§2 color, §3 type, §4 shape, §5 motion) plus the §9
// themeParams mapping. Components read ONLY from a resolved Theme; no hard-coded
// colors/sizes/timings live in the compositions.
//
// §9: variety comes from themeParams (palette / accent / font) and from layout —
// never from changing roles, timings, easing, or the shape language. So palette
// shifts only the COOL structure hue family; accents, type, motion, and shape are
// constant across every theme.

export type PaletteName = "midnight" | "slate" | "ink-indigo";
export type FontName = "inter" | "geist" | "system";

export interface ThemeParams {
  palette?: PaletteName;
  /** hex; sets motion/warm (and derives motion/warm-soft). */
  accent?: string;
  font?: FontName;
}

export interface TypeStyle {
  size: number;
  weight: number;
  lineHeight: number;
  /** letter-spacing in em. */
  tracking: number;
}

export interface Theme {
  color: {
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    nodeFill: string;
    nodeFillTop: string;
    nodeFillBottom: string;
    nodeBorder: string;
    connector: string;
    textPrimary: string;
    textMuted: string;
    textOnAccent: string;
    warm: string;
    warmSoft: string;
    focusCool: string;
    focusCoolSoft: string;
    doneTeal: string;
    doneTealSoft: string;
    errorCoral: string;
  };
  fontFamily: { sans: string; mono: string };
  type: {
    title: TypeStyle;
    nodeLabel: TypeStyle;
    nodeSublabel: TypeStyle;
    edgeLabel: TypeStyle;
    annotation: TypeStyle;
    counter: TypeStyle;
    code: TypeStyle;
  };
  shape: {
    nodeRadius: number;
    nodePadding: number;
    nodeIcon: number;
    borderIdle: number;
    borderActive: number;
    connectorWidth: number;
    arrowhead: number;
    pillRadius: number;
    pillPadX: number;
    pillPadY: number;
    packet: number;
    packetHalo: number;
    focusRingWidth: number;
    focusRingOffset: number;
    badge: number;
  };
  motion: {
    /** canonical durations in ms (§5). The renderer converts ms → frames per fps. */
    ms: {
      micro: number;
      fast: number;
      base: number;
      slow: number;
      beat: number;
      camera: number;
    };
    /** cubic-bezier control points (§5 easing curves). */
    easing: {
      outSoft: [number, number, number, number];
      inOut: [number, number, number, number];
      emphasis: [number, number, number, number];
    };
    /** cross-fade between node states (§6 node.state). */
    stateCrossfadeMs: number;
    /** looping periods (§6). */
    processingPeriodMs: number;
    highlightPulsePeriodMs: number;
  };
}

// ── §2 default "Midnight" cool-structure tokens (the ones palette may shift) ──
const MIDNIGHT_COOL = {
  bgBase: "#0E1118",
  bgSurface: "#161B26",
  bgElevated: "#1E2536",
  nodeFill: "#1E2A3C",
  nodeFillTop: "#232F44",
  nodeFillBottom: "#1A2434",
  nodeBorder: "#3A4763",
  connector: "#45516E",
};

// Accents + text are CONSTANT across palettes (§2, §9).
const FIXED_COLOR = {
  textPrimary: "#ECF0F8",
  textMuted: "#9AA6C2",
  textOnAccent: "#0E1118",
  warm: "#FFB25C",
  focusCool: "#4CC2FF",
  focusCoolSoft: "rgba(76,194,255,0.16)",
  doneTeal: "#54D6A6",
  doneTealSoft: "rgba(84,214,166,0.16)",
  errorCoral: "#FF6B6B",
};

/**
 * §9 palettes shift the cool hue family only. Rather than hand-picking new hexes
 * (which would risk drifting the relationships), we rotate hue / scale saturation
 * of the Midnight cool tokens by a fixed amount — a deterministic transform that
 * keeps every lightness relationship (and the whole shape/motion language) intact.
 */
const PALETTE_SHIFT: Record<PaletteName, { hue: number; sat: number }> = {
  midnight: { hue: 0, sat: 1 },
  slate: { hue: -10, sat: 0.55 },
  "ink-indigo": { hue: 22, sat: 1.18 },
};

export const DEFAULT_THEME_PARAMS: Required<ThemeParams> = {
  palette: "midnight",
  accent: FIXED_COLOR.warm,
  font: "inter",
};

const FONT_STACK: Record<FontName, (sans: string) => string> = {
  inter: (sans) => `${sans}, system-ui, sans-serif`,
  geist: () => `"Geist", system-ui, sans-serif`,
  system: () => `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
};

/** Resolve themeParams (+ the loaded Inter family) into a full token set. */
export function buildTheme(
  params: ThemeParams = {},
  interFamily = "Inter",
): Theme {
  const p = { ...DEFAULT_THEME_PARAMS, ...params };
  const shift = PALETTE_SHIFT[p.palette] ?? PALETTE_SHIFT.midnight;

  const cool = Object.fromEntries(
    Object.entries(MIDNIGHT_COOL).map(([k, hex]) => [
      k,
      shiftHue(hex, shift.hue, shift.sat),
    ]),
  ) as typeof MIDNIGHT_COOL;

  const warm = p.accent || FIXED_COLOR.warm;

  return {
    color: {
      ...cool,
      textPrimary: FIXED_COLOR.textPrimary,
      textMuted: FIXED_COLOR.textMuted,
      textOnAccent: FIXED_COLOR.textOnAccent,
      warm,
      warmSoft: withAlpha(warm, 0.16),
      focusCool: FIXED_COLOR.focusCool,
      focusCoolSoft: FIXED_COLOR.focusCoolSoft,
      doneTeal: FIXED_COLOR.doneTeal,
      doneTealSoft: FIXED_COLOR.doneTealSoft,
      errorCoral: FIXED_COLOR.errorCoral,
    },
    fontFamily: {
      sans: FONT_STACK[p.font](interFamily),
      mono: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
    },
    type: {
      title: { size: 56, weight: 600, lineHeight: 1.1, tracking: -0.02 },
      nodeLabel: { size: 28, weight: 600, lineHeight: 1.2, tracking: 0 },
      nodeSublabel: { size: 18, weight: 400, lineHeight: 1.3, tracking: 0 },
      edgeLabel: { size: 20, weight: 500, lineHeight: 1.2, tracking: 0 },
      annotation: { size: 24, weight: 500, lineHeight: 1.3, tracking: 0 },
      counter: { size: 88, weight: 700, lineHeight: 1.0, tracking: 0 },
      code: { size: 22, weight: 400, lineHeight: 1.5, tracking: 0 },
    },
    shape: {
      nodeRadius: 20,
      nodePadding: 24,
      nodeIcon: 40,
      borderIdle: 2,
      borderActive: 2.5,
      connectorWidth: 3,
      arrowhead: 14,
      pillRadius: 10,
      pillPadX: 16,
      pillPadY: 8,
      packet: 20,
      packetHalo: 40,
      focusRingWidth: 3,
      focusRingOffset: 8,
      badge: 28,
    },
    motion: {
      ms: {
        micro: 120,
        fast: 200,
        base: 320,
        slow: 600,
        beat: 900,
        camera: 600,
      },
      easing: {
        outSoft: [0.22, 0.61, 0.36, 1],
        inOut: [0.45, 0, 0.55, 1],
        emphasis: [0.34, 1.56, 0.64, 1],
      },
      stateCrossfadeMs: 250,
      processingPeriodMs: 1200,
      highlightPulsePeriodMs: 1000,
    },
  };
}

// ── color helpers (deterministic, no external deps) ──

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shiftHue(hex: string, deltaDeg: number, satScale: number): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const h2 = (((h + deltaDeg) % 360) + 360) % 360;
  const s2 = Math.max(0, Math.min(1, s * satScale));
  const { r: r2, g: g2, b: b2 } = hslToRgb(h2, s2, l);
  return rgbToHex(r2, g2, b2);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
