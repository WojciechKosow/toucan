package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;
import org.springframework.stereotype.Component;

/**
 * Generates the "animated code block" type: a typing effect with line highlighting and inline
 * annotations. The constrained system prompt below is where output quality lives — iterate on it.
 *
 * <p>When no model is configured ({@link LlmClient#isLive()} is false) it returns a deterministic,
 * self-contained stub so the full pipeline is runnable and testable without an API key.
 */
@Component
public class CodeBlockAnimationGenerator implements AnimationGenerator {

    private final LlmClient llmClient;

    public CodeBlockAnimationGenerator(LlmClient llmClient) {
        this.llmClient = llmClient;
    }

    @Override
    public AnimationType type() {
        return AnimationType.CODE_BLOCK;
    }

    @Override
    public String generate(String description) {
        if (!llmClient.isLive()) {
            return stub(description);
        }
        String raw = llmClient.complete(SYSTEM_PROMPT, buildUserPrompt(description));
        return sanitize(raw);
    }

    private String buildUserPrompt(String description) {
        return "Create an animated code-block explainer for this concept:\n\n"
                + description
                + "\n\nOutput only the complete, self-contained HTML document.";
    }

    private static final String SYSTEM_PROMPT =
            """
            You are Toucan's animation engine. You generate polished, self-contained web animations \
            that explain programming concepts for developer-educators (people making programming \
            tutorials and dev courses). You specialize in ANIMATED CODE BLOCKS.

            Given a short description of a concept, produce a single, complete, self-contained HTML \
            document that animates an explanation of that concept as a code block.

            The animation MUST include:
            - A typing effect: the code types itself in, character by character, at a readable pace.
            - Line highlighting: as the explanation advances, the relevant line(s) are highlighted.
            - Inline annotations: short callouts that explain the highlighted line in plain language, \
            appearing in sync with the highlight.

            Hard requirements:
            - Output ONE complete HTML5 document and NOTHING else. No markdown, no code fences, no \
            commentary before or after the document.
            - Fully self-contained: inline ALL CSS and JavaScript in the single file. Do NOT reference \
            any external resource — no CDNs, no web fonts, no external scripts, no images, no network \
            calls. Use a system monospace font stack.
            - The code shown must be correct and idiomatic for the concept. Infer a sensible short \
            snippet (roughly 5-14 lines) if the user did not give exact code.
            - The animation autoplays on load, runs through the full sequence, then ends gracefully (a \
            gentle loop is fine).

            Quality bar — this is the entire product, so make it genuinely good:
            - Modern, clean dark theme. An editor surface with window chrome (the three traffic-light \
            dots) and a filename tab. Line numbers. Tasteful syntax coloring via inline styles/classes.
            - Smooth, eased transitions. Rounded corners, subtle shadows, comfortable spacing, readable \
            font sizes. A visible caret while typing.
            - Annotations fade or slide in and clearly relate to the highlighted line.
            - It should look like something a professional creator would proudly embed — never generic, \
            cramped, or janky.
            - Design for a 16:9 viewport that scales down cleanly; the whole animation must be visible \
            without scrolling at 1280x720.

            Return only the HTML document.""";

    /**
     * Strips anything the model may wrap around the document (markdown fences, a stray preamble) so
     * what we publish is a clean HTML file.
     */
    private String sanitize(String raw) {
        String s = raw.strip();
        if (s.startsWith("```")) {
            int firstNewline = s.indexOf('\n');
            if (firstNewline >= 0) {
                s = s.substring(firstNewline + 1);
            }
            if (s.endsWith("```")) {
                s = s.substring(0, s.length() - 3);
            }
            s = s.strip();
        }
        int start = indexOfIgnoreCase(s, "<!doctype html");
        if (start < 0) {
            start = indexOfIgnoreCase(s, "<html");
        }
        if (start > 0) {
            s = s.substring(start);
        }
        return s.strip();
    }

    private static int indexOfIgnoreCase(String haystack, String needle) {
        return haystack.toLowerCase().indexOf(needle.toLowerCase());
    }

    private String stub(String description) {
        return STUB_TEMPLATE.replace("__DESCRIPTION__", htmlEscape(description));
    }

    private static String htmlEscape(String s) {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static final String STUB_TEMPLATE =
            """
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Toucan — Animated code block</title>
            <style>
              :root { color-scheme: dark; }
              * { box-sizing: border-box; }
              html, body { height: 100%; margin: 0; }
              body {
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                gap: 22px; min-height: 100%; padding: 32px;
                background: radial-gradient(1200px 600px at 50% -10%, #1f2937 0%, #0b1020 55%, #070a14 100%);
                color: #e5e7eb;
                font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
              }
              .lesson { text-align: center; max-width: 760px; }
              .kicker {
                display: inline-block; font-size: 12px; letter-spacing: .18em; text-transform: uppercase;
                color: #38bdf8; opacity: .9; margin-bottom: 10px;
              }
              .lesson h1 {
                margin: 0; font-size: 22px; line-height: 1.35; font-weight: 600; color: #f8fafc;
                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
              }
              .editor {
                width: min(760px, 92vw);
                background: #0f1524; border: 1px solid #1f2a3d; border-radius: 14px;
                box-shadow: 0 24px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04);
                overflow: hidden;
              }
              .titlebar {
                display: flex; align-items: center; gap: 8px;
                padding: 12px 16px; background: #111a2c; border-bottom: 1px solid #1f2a3d;
              }
              .dot { width: 12px; height: 12px; border-radius: 50%; }
              .dot.r { background: #ff5f57; } .dot.y { background: #febc2e; } .dot.g { background: #28c840; }
              .file { margin-left: 10px; font-size: 13px; color: #94a3b8; }
              #code { padding: 18px 18px 18px 8px; counter-reset: ln; font-size: 15px; line-height: 1.85; min-height: 230px; }
              .line {
                counter-increment: ln; position: relative; padding-left: 3.4em; white-space: pre;
                border-left: 2px solid transparent; transition: background .25s ease, border-color .25s ease;
              }
              .line::before {
                content: counter(ln); position: absolute; left: 0; width: 2.6em;
                text-align: right; padding-right: .9em; color: #3b4a63;
              }
              .line .txt { color: #c7d2fe; }
              .line.active { background: rgba(56,189,248,.10); border-left-color: #38bdf8; }
              .caret {
                display: inline-block; width: 8px; height: 1.05em; transform: translateY(2px);
                margin-left: 1px; background: #38bdf8; animation: blink 1s steps(2, start) infinite;
              }
              @keyframes blink { 50% { opacity: 0; } }
              .note {
                width: min(760px, 92vw); min-height: 24px; text-align: center;
                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                font-size: 15px; color: #cbd5e1;
                opacity: 0; transform: translateY(6px); transition: opacity .35s ease, transform .35s ease;
              }
              .note.show { opacity: 1; transform: translateY(0); }
              .note b { color: #38bdf8; font-weight: 600; }
              .footer { font-size: 11px; color: #475569; letter-spacing: .04em; }
            </style>
            </head>
            <body>
              <div class="lesson">
                <span class="kicker">Toucan · Animated code block</span>
                <h1>__DESCRIPTION__</h1>
              </div>
              <div class="editor">
                <div class="titlebar">
                  <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
                  <span class="file">example.js</span>
                </div>
                <div id="code"></div>
              </div>
              <div class="note" id="note"></div>
              <div class="footer">Generated by Toucan — preview stub (no model key configured)</div>

              <script>
                (function () {
                  var steps = [
                    { code: "function fib(n, memo = {}) {",                 note: "Define <b>fib</b> with a memo cache for results." },
                    { code: "  if (n <= 1) return n;",                       note: "Base case: <b>fib(0)=0</b>, <b>fib(1)=1</b>." },
                    { code: "  if (n in memo) return memo[n];",              note: "Return early if we have already computed <b>n</b>." },
                    { code: "  memo[n] = fib(n - 1, memo) + fib(n - 2, memo);", note: "Recurse, then cache the result in <b>memo</b>." },
                    { code: "  return memo[n];",                             note: "Hand back the memoized value." },
                    { code: "}",                                            note: "" }
                  ];

                  var code = document.getElementById("code");
                  var note = document.getElementById("note");
                  var i = 0;

                  function clearActive() {
                    var actives = code.querySelectorAll(".line.active");
                    for (var k = 0; k < actives.length; k++) actives[k].classList.remove("active");
                  }

                  function runStep() {
                    if (i >= steps.length) { setTimeout(reset, 2600); return; }
                    var step = steps[i];
                    clearActive();

                    var line = document.createElement("div");
                    line.className = "line active";
                    var txt = document.createElement("span"); txt.className = "txt";
                    var caret = document.createElement("span"); caret.className = "caret";
                    line.appendChild(txt); line.appendChild(caret);
                    code.appendChild(line);

                    var s = step.code, j = 0;
                    (function type() {
                      if (j <= s.length) {
                        txt.textContent = s.slice(0, j);
                        j++;
                        setTimeout(type, 26);
                      } else {
                        caret.remove();
                        if (step.note) { note.innerHTML = step.note; note.classList.add("show"); }
                        else { note.classList.remove("show"); }
                        i++;
                        setTimeout(runStep, step.note ? 1150 : 450);
                      }
                    })();
                  }

                  function reset() {
                    code.innerHTML = ""; note.innerHTML = ""; note.classList.remove("show"); i = 0;
                    runStep();
                  }

                  reset();
                })();
              </script>
            </body>
            </html>""";
}
