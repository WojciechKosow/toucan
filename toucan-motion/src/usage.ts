// Usage + cost telemetry for a generation run. The engine already collects the
// model's token usage (Anthropic streaming `finalMessage().usage`, OpenAI
// `completion.usage`); this module turns raw token counts into a per-model USD
// cost and a single parseable log line the Spring orchestrator reads and
// persists (billing-prep — no Stripe here, just the numbers).

/** Raw token counts for one provider/model call. */
export interface Usage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** {@link Usage} plus a computed dollar cost (null when the model isn't priced). */
export interface CostedUsage extends Usage {
  costUsd: number | null;
}

/**
 * USD per 1M tokens, keyed by model id. Anthropic rates are the standard
 * (non-introductory) prices so the cost line doesn't silently change at a
 * promo-expiry date; the OpenAI entry is approximate — verify before billing.
 * Unknown models report tokens with a null cost rather than a wrong number.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  // Anthropic (from the platform pricing table).
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  // OpenAI — approximate; confirm against current OpenAI pricing before billing.
  "gpt-4.1": { input: 2.0, output: 8.0 },
};

/** Dollar cost for a call, rounded to 6 dp, or null if the model isn't priced. */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/** Sum two usages (same provider/model); either side may be null. */
export function addUsage(a: Usage | null, b: Usage | null): Usage | null {
  if (!a) return b;
  if (!b) return a;
  return {
    provider: a.provider,
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export function toCostedUsage(u: Usage): CostedUsage {
  return { ...u, costUsd: computeCost(u.model, u.inputTokens, u.outputTokens) };
}

/**
 * One machine-parseable line: `usage[<stage>] {json}`. Human-readable (the
 * prefix names the stage and the JSON carries the cost) and easy for the
 * orchestrator to grep + JSON.parse.
 */
export function formatUsageLine(stage: string, u: Usage): string {
  return `usage[${stage}] ${JSON.stringify(toCostedUsage(u))}`;
}
