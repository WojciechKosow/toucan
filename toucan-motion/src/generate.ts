// Step 6 — generation: a topic (+ optional script) -> one self-contained HTML
// string, via the OpenAI API with prompts/system.md as the system prompt.
// No auto-repair loop in v0.1: if the output doesn't honor the contract we fail
// loudly and hand back the raw text for inspection.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

export const DEFAULT_MODEL = "gpt-4.1";
// Safe across gpt-4.1 (32k cap) and gpt-4o (16k cap); raise if your model allows
// and a richer HTML gets truncated.
const MAX_OUTPUT_TOKENS = 16000;
const SYSTEM_PROMPT_PATH = fileURLToPath(
  new URL("../prompts/system.md", import.meta.url),
);

export interface GenerateOptions {
  topic: string;
  script?: string;
  model?: string;
  /** Override the system prompt file (defaults to prompts/system.md). */
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

export async function generate(opts: GenerateOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Put it in .env (see .env.example), or use --html to capture an existing file without generating.",
    );
  }

  const system = await readFile(opts.promptPath ?? SYSTEM_PROMPT_PATH, "utf8");
  const userText = opts.script
    ? `Topic: ${opts.topic}\n\nBeat-by-beat script (follow these beats):\n${opts.script}`
    : `Topic: ${opts.topic}`;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const html = stripFences(raw);

  // Basic sanity check only (no repair loop in v0.1).
  if (!html.includes("__TOUCAN__") || !html.includes("seek")) {
    throw new GenerationError(
      "Generated output is missing the __TOUCAN__ / seek contract.",
      raw,
    );
  }

  return html;
}
