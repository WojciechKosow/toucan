// Step 6 — generation: a topic (+ optional script) -> one self-contained HTML
// string, via OpenAI or Anthropic (--provider), with prompts/system.md as the
// system prompt. Also exposes repair(): a one-shot fix that feeds a broken file
// + its capture error back to the model and asks for a corrected file.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Provider = "openai" | "anthropic";
export const PROVIDERS: Provider[] = ["openai", "anthropic"];
export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4.1",
  anthropic: "claude-opus-4-8",
};
// Safe across gpt-4.1 / gpt-4o / claude; raise if your model allows and a richer
// HTML gets truncated.
const MAX_OUTPUT_TOKENS = 16000;
const SYSTEM_PROMPT_PATH = fileURLToPath(
  new URL("../prompts/system.md", import.meta.url),
);
const REFERENCE_PATH = fileURLToPath(
  new URL("../fixtures/reference.html", import.meta.url),
);

export interface GenerateOptions {
  topic: string;
  script?: string;
  provider?: Provider;
  model?: string;
  /** mock=true returns fixtures/reference.html verbatim (ignores topic) — exercises
   *  the whole topic->MP4 path with no API key / no spend. */
  mock?: boolean;
  /** Override the system prompt file (defaults to prompts/system.md). */
  promptPath?: string;
}

export interface RepairOptions {
  brokenHtml: string;
  error: string;
  provider?: Provider;
  model?: string;
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
      max_completion_tokens: MAX_OUTPUT_TOKENS,
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
  const message = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: userText }],
  });
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
 * - mock: returns fixtures/reference.html verbatim (no API key, no spend).
 * - real: OpenAI/Anthropic call; strip fences; throw (with raw) on empty output.
 * Contract validity is checked separately by validateHtml().
 */
export async function generateHtml(opts: GenerateOptions): Promise<string> {
  if (opts.mock) {
    return readFile(REFERENCE_PATH, "utf8");
  }
  const provider = resolveProvider(opts.provider);
  const model = opts.model ?? DEFAULT_MODELS[provider];
  const system = await readFile(opts.promptPath ?? SYSTEM_PROMPT_PATH, "utf8");
  const userText = opts.script
    ? `${opts.topic}\n\n${opts.script}`
    : opts.topic;
  const raw = await callModel(provider, model, system, userText);
  return finalize(raw, "Generated output");
}

/** One-shot repair: hand the broken file + its capture error back to the model. */
export async function repair(opts: RepairOptions): Promise<string> {
  const provider = resolveProvider(opts.provider);
  const model = opts.model ?? DEFAULT_MODELS[provider];
  const system = await readFile(opts.promptPath ?? SYSTEM_PROMPT_PATH, "utf8");
  const userText = [
    "The following HTML was generated for a Toucan video but FAILED during headless capture.",
    "",
    "ERROR:",
    opts.error,
    "",
    "Return the COMPLETE corrected HTML file (same contract: one self-contained file; window.__TOUCAN__ with ready/durationMs/fps/seek; render(ms) total and pure; no CSS transitions). Fix the specific error AND any similar latent bugs — never reassign a const, guard every element/rect lookup so render(ms) cannot throw for any ms, and keep every scene a densely BUILT UI/diagram (no empty frames). Output ONLY the HTML, no commentary.",
    "",
    "--- BROKEN HTML ---",
    opts.brokenHtml,
  ].join("\n");
  const raw = await callModel(provider, model, system, userText);
  return finalize(raw, "Repair output");
}
