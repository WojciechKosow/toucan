package com.toucan_motion.toucan.generation.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

/**
 * Type 2 — Animated Code Block. Explains code with progressive reveal, line highlighting and
 * annotations.
 *
 * <p>v0.1 constraints (enforced in {@link #validateAndRepair()}): a single snippet, one language,
 * sequential steps; no diff view, split panes or multi-file. Line numbers in steps are 1-based.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class CodeSpec implements AnimationSpec {

    public static final int MAX_STEPS = 24;

    private String type = "code";
    private String language = "text";
    private String code = "";
    private List<Step> steps = new ArrayList<>();
    private Integer beatDurationMs;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Step {
        private List<Integer> revealLines = new ArrayList<>();
        private List<Integer> highlightLines = new ArrayList<>();
        private String annotation;

        public List<Integer> getRevealLines() {
            return revealLines;
        }

        public void setRevealLines(List<Integer> revealLines) {
            this.revealLines = revealLines;
        }

        public List<Integer> getHighlightLines() {
            return highlightLines;
        }

        public void setHighlightLines(List<Integer> highlightLines) {
            this.highlightLines = highlightLines;
        }

        public String getAnnotation() {
            return annotation;
        }

        public void setAnnotation(String annotation) {
            this.annotation = annotation;
        }
    }

    @Override
    public String wireType() {
        return "code";
    }

    @Override
    public void validateAndRepair() {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("A code animation needs a non-empty code snippet.");
        }
        // Normalise newlines so line indexing matches the renderer's split.
        code = code.replace("\r\n", "\n").replace("\r", "\n");
        int lineCount = code.split("\n", -1).length;

        if (language == null || language.isBlank()) {
            language = "text";
        }
        language = language.strip().toLowerCase();

        if (steps == null) {
            steps = new ArrayList<>();
        }
        steps.removeIf(s -> s == null);
        for (Step s : steps) {
            s.setRevealLines(clampLines(s.getRevealLines(), lineCount));
            s.setHighlightLines(clampLines(s.getHighlightLines(), lineCount));
            if (s.getAnnotation() != null && s.getAnnotation().isBlank()) {
                s.setAnnotation(null);
            }
        }
        if (steps.size() > MAX_STEPS) {
            steps = new ArrayList<>(steps.subList(0, MAX_STEPS));
        }
        // If the model gave no steps, reveal the whole snippet in one beat so it still renders.
        if (steps.isEmpty()) {
            Step all = new Step();
            List<Integer> every = new ArrayList<>();
            for (int i = 1; i <= lineCount; i++) {
                every.add(i);
            }
            all.setRevealLines(every);
            steps.add(all);
        }
        if (beatDurationMs != null) {
            beatDurationMs = Math.max(300, Math.min(6000, beatDurationMs));
        }
        type = "code";
    }

    private static List<Integer> clampLines(List<Integer> lines, int lineCount) {
        List<Integer> out = new ArrayList<>();
        if (lines == null) {
            return out;
        }
        for (Integer l : lines) {
            if (l != null && l >= 1 && l <= lineCount && !out.contains(l)) {
                out.add(l);
            }
        }
        return out;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public List<Step> getSteps() {
        return steps;
    }

    public void setSteps(List<Step> steps) {
        this.steps = steps;
    }

    public Integer getBeatDurationMs() {
        return beatDurationMs;
    }

    public void setBeatDurationMs(Integer beatDurationMs) {
        this.beatDurationMs = beatDurationMs;
    }
}
