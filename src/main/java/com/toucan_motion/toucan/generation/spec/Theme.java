package com.toucan_motion.toucan.generation.spec;

/**
 * The single set of design tokens every renderer reads. The motion-design polish is authored once in
 * the renderers; the theme is the only thing the (deferred) style-memory feature will override, so
 * keeping every visual decision behind these tokens is what makes that feature nearly free.
 *
 * <p>v0.1 ships exactly one professional default ({@link #DEFAULT}): dark, high-contrast, generous
 * spacing, one clean sans + one mono.
 *
 * <ul>
 *   <li>Colors are CSS color strings.
 *   <li>{@code radius}/{@code gap} are pixels.
 *   <li>{@code easing} is a CSS timing function.
 *   <li>{@code beatDurationMs} is the fallback beat length when a spec omits its own.
 *   <li>{@code nodeFillTop}/{@code nodeFillBottom} — vertical gradient for node elevation.
 *   <li>{@code accentWarm} — traveler / active-node color (motion, "where the action is").
 *   <li>{@code accentDone} — final-node arrival / success color.
 *   <li>{@code shadow} — rgba drop-shadow under nodes.
 * </ul>
 */
public record Theme(
        String background,
        String surface,
        String nodeFill,
        String nodeFillTop,
        String nodeFillBottom,
        String nodeBorder,
        String nodeText,
        String mutedText,
        String accent,
        String accentSoft,
        String accentWarm,
        String accentDone,
        String connector,
        String shadow,
        String fontSans,
        String fontMono,
        int radius,
        int gap,
        String easing,
        int beatDurationMs) {

    /** The one professional default theme shipped in v0.1. */
    public static final Theme DEFAULT =
            new Theme(
                    "#10131C",          // background (used as gradient start in flow renderer)
                    "#121826",          // surface
                    "#1E2A3C",          // nodeFill (fallback; flow uses gradient)
                    "#222C3E",          // nodeFillTop
                    "#1A2230",          // nodeFillBottom
                    "#39445E",          // nodeBorder
                    "#ECF0F8",          // nodeText
                    "#9CA8C4",          // mutedText
                    "#4cc2ff",          // accent (kept for code/datastructure renderers)
                    "rgba(76,194,255,0.16)", // accentSoft
                    "#FFB35C",          // accentWarm — motion / active
                    "#5BD6A8",          // accentDone — arrival / success
                    "#4A5573",          // connector (clearly visible track)
                    "rgba(0,0,0,0.45)", // shadow
                    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
                    16,                 // radius
                    44,                 // gap (min connector gap; layout may grow it)
                    "cubic-bezier(0.22, 0.61, 0.36, 1)",
                    900);
}
