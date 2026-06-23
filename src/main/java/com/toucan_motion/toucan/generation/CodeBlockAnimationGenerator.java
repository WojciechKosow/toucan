package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;
import com.toucan_motion.toucan.generation.render.HtmlBundler;
import com.toucan_motion.toucan.generation.spec.CodeSpec;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Type 2 — Animated Code Block. The model decides the snippet, language and the reveal/highlight
 * steps; all typing, highlighting and layout live in {@code renderer/code.js}.
 */
@Component
public class CodeBlockAnimationGenerator extends SpecAnimationGenerator<CodeSpec> {

    public CodeBlockAnimationGenerator(LlmClient llm, HtmlBundler bundler) {
        super(llm, bundler);
    }

    @Override
    public AnimationType type() {
        return AnimationType.CODE_BLOCK;
    }

    @Override
    protected String wireType() {
        return "code";
    }

    @Override
    protected Class<CodeSpec> specClass() {
        return CodeSpec.class;
    }

    @Override
    protected String rendererResource() {
        return "renderer/code.js";
    }

    @Override
    protected String title(CodeSpec spec) {
        return "Toucan — " + spec.getLanguage() + " walkthrough";
    }

    @Override
    protected String systemPrompt() {
        return """
                You author "Animated Code Block" explainers for Toucan. You do NOT write HTML, CSS or \
                animation — a deterministic renderer handles typing, syntax highlighting, line \
                highlighting and annotations. Your only job is to return a JSON spec.

                Return ONE JSON object and NOTHING else (no prose, no markdown fences), matching:

                {
                  "language": "java",
                  "code": "public int add(int a, int b) {\\n    return a + b;\\n}",
                  "steps": [
                    { "revealLines": [1], "annotation": "Method signature" },
                    { "highlightLines": [2], "annotation": "The actual work" }
                  ],
                  "beatDurationMs": 1200
                }

                RULES:
                - "code" is ONE correct, idiomatic snippet (roughly 5-14 lines). Use real "\\n" \
                newlines inside the JSON string. Infer a tight snippet if the user gave no exact code.
                - "language" is a lowercase identifier (java, javascript, python, go, …).
                - "steps" run in order. Line numbers are 1-based and refer to lines of "code".
                - Use "revealLines" to type lines in; "highlightLines" to spotlight already-shown \
                lines. A step may use either or both, plus a short "annotation".
                - Walk the reader through the snippet so the final step leaves the whole thing shown.
                - Keep annotations short and plain-language.
                """;
    }

    @Override
    protected String userPrompt(String description) {
        return "Concept to explain as an animated code block:\n\n"
                + description
                + "\n\nReturn only the JSON spec.";
    }

    @Override
    protected CodeSpec stubSpec(String description) {
        // Deterministic, schema-valid sample (memoized Fibonacci) so the pipeline runs without a key.
        CodeSpec spec = new CodeSpec();
        spec.setLanguage("javascript");
        spec.setCode(
                "function fib(n, memo = {}) {\n"
                        + "  if (n <= 1) return n;\n"
                        + "  if (n in memo) return memo[n];\n"
                        + "  memo[n] = fib(n - 1, memo) + fib(n - 2, memo);\n"
                        + "  return memo[n];\n"
                        + "}");
        spec.setSteps(new java.util.ArrayList<>(List.of(
                step(List.of(1), null, "Define fib with a memo cache"),
                step(List.of(2), null, "Base case: fib(0)=0, fib(1)=1"),
                step(List.of(3), null, "Return early if already computed"),
                step(List.of(4), null, "Recurse, then cache the result"),
                step(null, List.of(5), "Hand back the memoized value"))));
        spec.setBeatDurationMs(1200);
        return spec;
    }

    private static CodeSpec.Step step(List<Integer> reveal, List<Integer> highlight, String note) {
        CodeSpec.Step s = new CodeSpec.Step();
        if (reveal != null) {
            s.setRevealLines(new java.util.ArrayList<>(reveal));
        }
        if (highlight != null) {
            s.setHighlightLines(new java.util.ArrayList<>(highlight));
        }
        s.setAnnotation(note);
        return s;
    }
}
