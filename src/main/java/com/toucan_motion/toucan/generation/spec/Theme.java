package com.toucan_motion.toucan.generation.spec;

/**
 * The single set of design tokens every renderer reads. The motion-design polish is authored once in
 * the renderers; the theme is the only thing the (deferred) style-memory feature will override, so
 * keeping every visual decision behind these tokens is what makes that feature nearly free.
 *
 * <p>v0.1 ships exactly one professional default ({@link #DEFAULT}): dark, high-contrast, generous
 * spacing, one clean sans + one mono. Colors are CSS color strings; {@code radius}/{@code gap} are
 * pixels; {@code easing} is a CSS timing function; {@code beatDurationMs} is the fallback beat length
 * used when a spec does not specify its own.
 */
public record Theme(
        String background,
        String surface,
        String nodeFill,
        String nodeBorder,
        String nodeText,
        String mutedText,
        String accent,
        String accentSoft,
        String connector,
        String fontSans,
        String fontMono,
        int radius,
        int gap,
        String easing,
        int beatDurationMs) {

    /** The one professional default theme shipped in v0.1. */
    public static final Theme DEFAULT =
            new Theme(
                    "#0b0f1a",
                    "#121826",
                    "#16203a",
                    "#2a3656",
                    "#e6ecf7",
                    "#8b97b3",
                    "#4cc2ff",
                    "rgba(76,194,255,0.16)",
                    "#2f3c5c",
                    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
                    14,
                    28,
                    "cubic-bezier(0.22, 0.61, 0.36, 1)",
                    900);
}
