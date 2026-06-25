// Inter, bundled via @remotion/google-fonts (no runtime fetch at render — §3).
// loadFont() registers the @font-face and returns the family to use in styles.
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

/** The loaded Inter family name; fed into buildTheme() for the sans stack. */
export const interFontFamily = fontFamily;
