// Step 6 — generation: a topic (+ optional script) -> one self-contained HTML
// string, via OpenAI or Anthropic (--provider), with prompts/system.md as the
// system prompt. Also exposes repair(): a one-shot fix that feeds a broken file
// + its capture error back to the model and asks for a corrected file.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { CaptureEngine } from "./capture.js";

export type Provider = "openai" | "anthropic";
export const PROVIDERS: Provider[] = ["openai", "anthropic"];
export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4.1",
  anthropic: "claude-sonnet-5",
};
/** What the model writes to: a capture contract (seek/vt) or freeform —
 *  natural HTML/CSS/JS animation with NO capture contract (the deliverable is
 *  the HTML itself; capture for freeform comes later). */
export type GenEngine = CaptureEngine | "freeform";
export const GEN_ENGINES: GenEngine[] = ["seek", "vt", "freeform"];
// OpenAI: safe across gpt-4.1 (32k cap) / gpt-4o (16k cap).
const MAX_OUTPUT_TOKENS_OPENAI = 16000;
// Anthropic: claude-sonnet-5 allows up to 128k output; we stream (required for
// large max_tokens) so rich HTML never truncates.
const MAX_OUTPUT_TOKENS_ANTHROPIC = 64000;
const PROMPT_PATHS: Record<GenEngine, string> = {
  seek: fileURLToPath(new URL("../prompts/system.md", import.meta.url)),
  vt: fileURLToPath(new URL("../prompts/system-vt.md", import.meta.url)),
  freeform: fileURLToPath(
    new URL("../prompts/system-freeform.md", import.meta.url),
  ),
};
// The screenwriter ("director") prompt: topic -> a beat-by-beat script, run on
// its own via `generate --plan` so a human can approve/tweak before the animator
// spends its whole budget realizing it.
const SCRIPT_PROMPT_PATH = fileURLToPath(
  new URL("../prompts/system-script.md", import.meta.url),
);
// `--plan --mock` returns this canonical example script verbatim (no API key) —
// it's the exact bracketed-beat format the animator consumes.
const SCRIPT_MOCK_PATH = fileURLToPath(
  new URL("../examples/login-flow.txt", import.meta.url),
);
const MOCK_PATHS: Record<GenEngine, string> = {
  seek: fileURLToPath(new URL("../fixtures/reference.html", import.meta.url)),
  vt: fileURLToPath(new URL("../fixtures/css-anim.html", import.meta.url)),
  // The flagship non-UI reference: "How Taxes Work" — pure illustration (person,
  // coins that split into tax, a treasury, a hub-and-spoke of SVG-icon services),
  // NO browser/card/phone. Best proof the freeform path explains any process
  // without a "website vibe". Other references: freeform-diagram.html (DNS graph
  // + traveling packet), freeform-ui.html (a UI flow with the focal camera).
  freeform: fileURLToPath(
    new URL("../fixtures/freeform-taxes.html", import.meta.url),
  ),
};

export interface GenerateOptions {
  topic: string;
  script?: string;
  provider?: Provider;
  model?: string;
  /** Selects the contract the model writes to: seek (render(ms), no CSS motion),
   *  vt (natural CSS animation, dormant until __TOUCAN_START__), or freeform
   *  (natural animation, autoplay, no capture contract). */
  engine?: GenEngine;
  /** mock=true returns the engine's reference fixture verbatim (ignores topic) —
   *  exercises the whole topic->MP4 path with no API key / no spend. */
  mock?: boolean;
  /** Override the system prompt file (defaults to the engine's prompt). */
  promptPath?: string;
}

export interface ScriptOptions {
  topic: string;
  provider?: Provider;
  model?: string;
  /** mock=true returns the canonical example script verbatim (no API key). */
  mock?: boolean;
  /** Override the screenwriter prompt (defaults to prompts/system-script.md). */
  promptPath?: string;
}

export interface RepairOptions {
  brokenHtml: string;
  error: string;
  provider?: Provider;
  model?: string;
  engine?: GenEngine;
  promptPath?: string;
}

/** Thrown when the model's output doesn't satisfy the HTML contract. Carries the
 *  raw text so the caller can save it for inspection. */
export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/** Resolve the provider: explicit > TOUCAN_PROVIDER env > whichever key is set > openai. */
export function resolveProvider(explicit?: string): Provider {
  const v = (explicit ?? process.env.TOUCAN_PROVIDER ?? "").toLowerCase();
  if (v === "openai" || v === "anthropic") return v;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "openai";
}

/** Strip a single ```html ... ``` (or bare ```) fence if the model added one. */
function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return t
    .replace(/^```[a-zA-Z]*\s*\n/, "")
    .replace(/\n```$/, "")
    .trim();
}

async function callModel(
  provider: Provider,
  model: string,
  system: string,
  userText: string,
): Promise<string> {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Put it in .env, use --provider anthropic, or use --html (no key needed).",
      );
    }
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: MAX_OUTPUT_TOKENS_OPENAI,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Put it in .env, use --provider openai, or use --html (no key needed).",
    );
  }
  const client = new Anthropic({ apiKey });
  // Stream (required for large max_tokens to avoid HTTP timeouts) and collect
  // the final message.
  const stream = client.messages.stream({
    model,
    max_tokens: MAX_OUTPUT_TOKENS_ANTHROPIC,
    system,
    messages: [{ role: "user", content: userText }],
  });
  const message = await stream.finalMessage();
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Strip fences and reject empty output (the contract itself is gated by
 *  validateHtml in validate.ts, not here). */
function finalize(raw: string, what: string): string {
  const html = stripFences(raw);
  if (!html.trim()) {
    throw new GenerationError(`${what} was empty.`, raw);
  }
  return html;
}

/**
 * topic -> one self-contained HTML string.
 * - mock: returns the engine's reference fixture verbatim (no API key, no spend).
 * - real: OpenAI/Anthropic call; strip fences; throw (with raw) on empty output.
 * Contract validity is checked separately by validateHtml().
 */
export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const engine = opts.engine ?? "seek";
  if (opts.mock) {
    return readFile(MOCK_PATHS[engine], "utf8");
  }
  const provider = resolveProvider(opts.provider);
  const model = opts.model ?? DEFAULT_MODELS[provider];
  const system = await readFile(
    opts.promptPath ?? PROMPT_PATHS[engine],
    "utf8",
  );
  const userText = opts.script ? `${opts.topic}\n\n${opts.script}` : opts.topic;
  const raw = await callModel(provider, model, system, userText);
  return finalize(raw, "Generated output");
}

/**
 * topic -> a beat-by-beat script (plain text), via the screenwriter prompt.
 * This is step (a) of the two-step flow: draft a locked plan the user approves
 * (or tweaks) before it's fed to the animator through `generate --script`.
 * - mock: returns the canonical example script verbatim (no API key, no spend).
 */
export async function generateScript(opts: ScriptOptions): Promise<string> {
  if (opts.mock) {
    return (await readFile(SCRIPT_MOCK_PATH, "utf8")).trim();
  }
  const provider = resolveProvider(opts.provider);
  const model = opts.model ?? DEFAULT_MODELS[provider];
  const system = await readFile(opts.promptPath ?? SCRIPT_PROMPT_PATH, "utf8");
  const raw = await callModel(provider, model, system, opts.topic);
  const script = stripFences(raw);
  if (!script.trim()) {
    throw new GenerationError("Generated script was empty.", raw);
  }
  return script;
}

const REPAIR_CONTRACT: Record<GenEngine, string> = {
  seek: "same contract: one self-contained file; window.__TOUCAN__ with ready/durationMs/fps/seek; render(ms) total and pure — it must not throw for any ms; no CSS transitions/@keyframes",
  vt: "same contract: one self-contained file; window.__TOUCAN__ with ready/durationMs/fps; window.__TOUCAN_START__ that begins a timeline which is FULLY DORMANT before it; autoplay only when !window.__TOUCAN_RECORDER__; natural CSS animation is allowed",
  freeform:
    "same requirements: ONE self-contained HTML file (inline CSS/JS; a Google Fonts <link> is the only external resource allowed); 1920×1080 16:9 stage; it AUTOPLAYS on load and visibly animates; natural CSS/JS animation is allowed and encouraged; the script must run start-to-finish with ZERO uncaught errors",
};

/** One-shot repair: hand the broken file + its capture error back to the model. */
export async function repair(opts: RepairOptions): Promise<string> {
  const engine = opts.engine ?? "seek";
  const provider = resolveProvider(opts.provider);
  const model = opts.model ?? DEFAULT_MODELS[provider];
  const system = await readFile(
    opts.promptPath ?? PROMPT_PATHS[engine],
    "utf8",
  );
  const userText = [
    "The following HTML was generated for a Toucan video but FAILED during headless capture.",
    "",
    "ERROR:",
    opts.error,
    "",
    `Return the COMPLETE corrected HTML file (${REPAIR_CONTRACT[engine]}). Fix the specific error AND any similar latent bugs — never reassign a const, guard every element lookup so the timeline cannot throw, and keep every scene a densely BUILT UI/diagram (no empty frames). Output ONLY the HTML, no commentary.`,
    "",
    "--- BROKEN HTML ---",
    opts.brokenHtml,
  ].join("\n");
  const raw = await callModel(provider, model, system, userText);
  return finalize(raw, "Repair output");
}
