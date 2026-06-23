package com.toucan_motion.toucan.generation;

/**
 * Pulls a single JSON object out of a model response. Models often wrap JSON in markdown fences or a
 * sentence of preamble even when told not to; this isolates the outermost {@code { ... }} so the spec
 * parser sees clean JSON.
 */
final class JsonExtractor {

    private JsonExtractor() {}

    /**
     * @return the substring from the first {@code {} to its matching {@code }} (brace-aware, so braces
     *     inside strings don't fool it), or the trimmed input if no object is found.
     */
    static String extract(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.strip();
        // strip a leading ```json / ``` fence if present
        if (s.startsWith("```")) {
            int nl = s.indexOf('\n');
            if (nl >= 0) {
                s = s.substring(nl + 1);
            }
            int fence = s.lastIndexOf("```");
            if (fence >= 0) {
                s = s.substring(0, fence);
            }
            s = s.strip();
        }
        int start = s.indexOf('{');
        if (start < 0) {
            return s;
        }
        boolean inString = false;
        boolean escaped = false;
        int depth = 0;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return s.substring(start, i + 1);
                }
            }
        }
        return s.substring(start);
    }
}
