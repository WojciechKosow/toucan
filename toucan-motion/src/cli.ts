#!/usr/bin/env node
// Step 7 — CLI: ties generation + capture + encode together.
//
//   toucan-motion generate --topic "how a shopping site works" --out out/shop.html
//     topic -> ANIMATION HTML (freeform engine: natural CSS/JS, no capture
//     contract). The HTML file IS the deliverable; it's gated by a static
//     self-containment check + a headless-Chromium smoke test (zero uncaught
//     errors, real DOM, visible motion), with one auto-repair pass on failure.
//
//   toucan-motion generate --plan --topic "how a shopping site works"
//     Step (a) of the two-step flow: run ONLY the screenwriter and stop. The
//     topic -> a beat-by-beat script (prompts/system-script.md), printed to
//     stdout for you to approve/tweak, then fed back via --script to animate.
//
//   toucan-motion generate --edit --html cur.html --topic "make the accent blue"
//     Step (b), session/chat: revise an existing animation. current HTML +
//     optional --thread + the change (--topic) -> the full file with only that
//     change applied (prompts/system-edit.md). Same gate as a fresh generation.
//
//   toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
//     [--script path.txt]   beat-by-beat brief appended to the topic
//     [--html path.html]    skip generation, capture an existing file (dev loop)
//     [--provider openai|anthropic]
//     [--model <id>]
//     [--fps 30]            override the HTML's declared fps
//
// On a generation+capture run, if the generated HTML fails the capture contract
// (never becomes ready, or render(ms) throws), one auto-repair pass feeds the
// broken file + error back to the model and re-captures.
//     [--keep-frames]       don't delete PNG frames after encode
//     [--keep-html]         don't delete generated HTML after encode

import "dotenv/config";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  ENGINES,
  capture,
  type CaptureEngine,
  type CaptureResult,
} from "./capture.js";
import { encode } from "./encode.js";
import { smokeTest, validateFreeformHtml } from "./freeform.js";
import {
  DEFAULT_MODELS,
  GEN_ENGINES,
  GenerationError,
  PROVIDERS,
  type GenEngine,
  type Provider,
  editHtml,
  generateHtml,
  generateScript,
  repair,
  resolveProvider,
} from "./generate.js";
import {
  validateFile,
  validateHtml,
  type ValidationResult,
} from "./validate.js";

interface Flags {
  topic?: string;
  script?: string;
  thread?: string;
  html?: string;
  model?: string;
  provider?: string;
  engine?: string;
  out?: string;
  fps?: number;
  mock: boolean;
  plan: boolean;
  edit: boolean;
  keepFrames: boolean;
  keepHtml: boolean;
}

const VALUE_FLAGS: Record<string, keyof Flags> = {
  "--topic": "topic",
  "--script": "script",
  "--thread": "thread",
  "--html": "html",
  "--model": "model",
  "--provider": "provider",
  "--engine": "engine",
  "--out": "out",
  "--fps": "fps",
};
const BOOL_FLAGS: Record<string, keyof Flags> = {
  "--mock": "mock",
  "--plan": "plan",
  "--edit": "edit",
  "--keep-frames": "keepFrames",
  "--keep-html": "keepHtml",
};

const USAGE = `toucan-motion — topic -> explainer animation (v0.1)

Usage:
  toucan-motion generate --topic "<topic>" [--out <file.html>] [options]
  toucan-motion render --topic "<topic>" --out <file.mp4> [options]
  toucan-motion render --html <file.html> --out <file.mp4> [options]
  toucan-motion check  --html <file.html> [--engine seek|vt|freeform]

generate — topic -> ANIMATION HTML (the current product; open it in a browser):
  --topic <text>     Topic to explain (with --edit: the change to make). Required.
  --plan             Run ONLY the screenwriter: draft a beat-by-beat script from
                     the topic, print it, and stop (no HTML). Review/tweak it,
                     then rerun generate with --script <file> to animate it.
  --edit             Revise an existing animation instead of generating a new one:
                     --html <current> + --topic <change> -> the full file with
                     only that change applied. --thread <file> carries the prior
                     conversation. Writes <current>.edited.html unless --out given.
  --html <file>      With --edit: the current animation to revise.
  --thread <file>    With --edit: the prior conversation for this animation.
  --out <file>       generate: output HTML path (default: out/<topic-slug>.html).
                     generate --plan: also save the script to this file.
                     generate --edit: output path (default: <current>.edited.html).
  --script <file>    Beat-by-beat brief appended to the topic.
  --mock             Use the reference fixture (with --plan, the example script;
                     with --edit, an identity edit) instead of the API (no key).
  --provider <name>  openai | anthropic (default: openai, or whichever key is set).
  --model <id>       Model id (default: ${DEFAULT_MODELS.openai} for openai, ${DEFAULT_MODELS.anthropic} for anthropic).
  Uses the freeform engine: natural CSS/JS animation, autoplay, NO capture
  contract. Gated by a self-containment check + a headless smoke test (zero
  uncaught errors, real DOM, visible motion); one auto-repair pass on failure.

  Recommended two-step flow (a locked plan lets the model spend its whole budget
  on craft, and gives you an approval checkpoint):
    node dist/cli.js generate --plan --topic "how a login works" > beats.txt
    # edit beats.txt to taste, then:
    node dist/cli.js generate --topic "how a login works" --script beats.txt --out out/login.html
    # follow up with a surgical edit — change only what you ask:
    node dist/cli.js generate --edit --html out/login.html --topic "make the accent blue"

render — topic/HTML -> MP4 (capture engines only):
  --topic <text>     Topic to explain (required unless --html).
  --out <file.mp4>   Output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --mock             Use the engine's reference fixture instead of the API (no key, no spend).
  --engine <name>    seek (default; render(ms) contract, no CSS motion) | vt (natural CSS
                     animation captured on a virtual clock — higher motion quality).
  --provider <name>  openai | anthropic (default: openai, or whichever key is set).
  --model <id>       Model id (default: ${DEFAULT_MODELS.openai} for openai, ${DEFAULT_MODELS.anthropic} for anthropic).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.

check:
  --html <file>      Gate an HTML file; print PASS/FAIL.
  --engine <name>    seek | vt: static contract + determinism check.
                     freeform: self-containment + headless smoke test.

Examples:
  toucan-motion generate --plan --topic "how a shopping site works" > beats.txt
  toucan-motion generate --topic "how a shopping site works" --script beats.txt
  toucan-motion generate --topic "how a shopping site works" --out out/shop.html
  toucan-motion generate --edit --html out/shop.html --topic "make the accent blue"
  toucan-motion generate --topic "how a shopping site works" --mock
  toucan-motion render --topic "how a shopping site works" --mock --out out/mock.mp4
  toucan-motion render --topic "how a shopping site works" --out out/shop.mp4 --engine vt
  toucan-motion check  --html fixtures/reference.html
  toucan-motion check  --html out/shop.html --engine freeform`;

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    mock: false,
    plan: false,
    edit: false,
    keepFrames: false,
    keepHtml: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a in VALUE_FLAGS) {
      const v = args[++i];
      if (v === undefined) fail(`Missing value for ${a}`);
      const key = VALUE_FLAGS[a];
      if (key === "fps") flags.fps = Number(v);
      else (flags[key] as string) = v;
    } else if (a in BOOL_FLAGS) {
      (flags[BOOL_FLAGS[a]] as boolean) = true;
    } else {
      fail(`Unknown option: ${a}`);
    }
  }
  return flags;
}

function fail(msg: string): never {
  console.error(`error: ${msg}\n`);
  console.error(USAGE);
  process.exit(1);
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `        ${l}`)
    .join("\n");
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "scene"
  );
}

/** Exit with a message but without dumping the usage block (for run-time failures). */
function die(msg: string): never {
  console.error(`\n${msg}`);
  process.exit(1);
}

function report(label: string, r: ValidationResult): void {
  console.log(`[${r.ok ? "PASS" : "FAIL"}] ${label}`);
  for (const w of r.warnings) console.log(`        warn:  ${w}`);
  for (const e of r.errors) console.log(`        error: ${e}`);
}

function resolveEngine(flags: Flags): CaptureEngine {
  if (flags.engine === "freeform")
    fail(
      "--engine freeform has no capture contract and cannot be rendered to MP4 yet — use `toucan-motion generate` to produce the HTML",
    );
  if (flags.engine && !ENGINES.includes(flags.engine as CaptureEngine))
    fail(`--engine must be one of: ${ENGINES.join(", ")}`);
  return (flags.engine as CaptureEngine) ?? "seek";
}

function resolveGenEngine(flags: Flags): GenEngine {
  if (flags.engine && !GEN_ENGINES.includes(flags.engine as GenEngine))
    fail(`--engine must be one of: ${GEN_ENGINES.join(", ")}`);
  return (flags.engine as GenEngine) ?? "seek";
}

async function checkCmd(flags: Flags): Promise<void> {
  if (!flags.html) fail("check requires --html <file>");
  const engine = resolveGenEngine(flags);
  console.log(`check ${flags.html} (engine: ${engine})`);
  let staticResult: ValidationResult;
  let runtime: ValidationResult;
  if (engine === "freeform") {
    staticResult = validateFreeformHtml(await readFile(flags.html, "utf8"));
    report("static (self-contained)", staticResult);
    runtime = await smokeTest(flags.html);
    report("runtime smoke", runtime);
  } else {
    ({ static: staticResult, runtime } = await validateFile(
      flags.html,
      engine,
    ));
    report("static contract", staticResult);
    report("runtime determinism", runtime);
  }
  const ok = staticResult.ok && runtime.ok;
  console.log(`\n${ok ? "PASS" : "FAIL"} — ${flags.html}`);
  process.exit(ok ? 0 : 1);
}

/** Static-gate freshly written HTML; on failure keep the file and exit non-zero. */
async function staticGate(
  htmlPath: string,
  engine: CaptureEngine,
): Promise<void> {
  const res = validateHtml(await readFile(htmlPath, "utf8"), engine);
  for (const w of res.warnings) console.log(`      warn: ${w}`);
  if (!res.ok) {
    for (const e of res.errors) console.log(`      error: ${e}`);
    die(
      `Contract validation FAILED for ${htmlPath} (kept for inspection). Not encoding.`,
    );
  }
  console.log(`      contract OK`);
}

/** Run the freeform gate (static + smoke); returns the merged result. */
async function freeformGate(htmlPath: string): Promise<ValidationResult> {
  const staticResult = validateFreeformHtml(await readFile(htmlPath, "utf8"));
  report("static (self-contained)", staticResult);
  if (!staticResult.ok) return staticResult;
  const runtime = await smokeTest(htmlPath);
  report("runtime smoke", runtime);
  return {
    ok: runtime.ok,
    errors: runtime.errors,
    warnings: [...staticResult.warnings, ...runtime.warnings],
  };
}

/** Gate freshly written freeform HTML (self-containment + smoke); on failure,
 *  one auto-repair pass — real generations only (a broken mock is our bug).
 *  Shared by generate and generate --edit; the file is left on disk either way. */
async function gateWithRepair(
  outPath: string,
  provider: Provider,
  model: string | undefined,
  mock: boolean,
): Promise<ValidationResult> {
  let result = await freeformGate(outPath);
  if (!result.ok && !mock) {
    console.log(`auto-repairing once (${provider})…`);
    const broken = await readFile(outPath, "utf8");
    try {
      const fixed = await repair({
        brokenHtml: broken,
        error: result.errors.join("\n"),
        provider,
        model,
        engine: "freeform",
      });
      await writeFile(outPath, fixed, "utf8");
    } catch (rerr) {
      if (rerr instanceof GenerationError) {
        const rawPath = outPath.replace(/\.html?$/i, "") + ".raw.txt";
        await writeFile(rawPath, rerr.raw, "utf8");
        die(`Repair failed: ${rerr.message} Raw output saved to ${rawPath}`);
      }
      throw rerr;
    }
    console.log(`re-gating repaired HTML…`);
    result = await freeformGate(outPath);
  }
  return result;
}

/** generate --plan — step (a) of the two-step flow: run ONLY the screenwriter
 *  and stop. The topic goes to the "director" prompt; the beat-by-beat script it
 *  drafts is printed to stdout (all status on stderr, so stdout is a clean,
 *  redirectable script). The human reviews/tweaks it, then feeds it back with
 *  `generate --topic "…" --script <file>` to make the animation. */
async function planCmd(flags: Flags): Promise<void> {
  if (!flags.topic) fail("generate --plan requires --topic");
  if (flags.html) fail("--html does not apply to generate --plan");
  if (flags.provider && !PROVIDERS.includes(flags.provider as Provider))
    fail(`--provider must be one of: ${PROVIDERS.join(", ")}`);
  const provider = resolveProvider(flags.provider);
  const model = flags.model ?? DEFAULT_MODELS[provider];
  const src = flags.mock ? "mock (example script)" : `${provider}/${model}`;
  // Status -> stderr; the script itself is the only thing on stdout.
  console.error(
    `drafting a beat-by-beat script for "${flags.topic}" (${src})…`,
  );

  let script: string;
  try {
    script = await generateScript({
      topic: flags.topic,
      provider,
      model: flags.model,
      mock: flags.mock,
    });
  } catch (err) {
    if (err instanceof GenerationError) die(err.message);
    throw err;
  }

  process.stdout.write(script.endsWith("\n") ? script : `${script}\n`);
  if (flags.out) {
    await mkdir(dirname(flags.out), { recursive: true });
    await writeFile(flags.out, `${script}\n`, "utf8");
    console.error(`\nsaved to ${flags.out}`);
  }
  console.error(
    `\nreview/tweak the script above, then make the animation:\n` +
      `  node dist/cli.js generate --topic ${JSON.stringify(flags.topic)} --script <file> --provider ${provider}`,
  );
}

/** generate — topic -> animation HTML (freeform engine, no capture contract).
 *  The HTML file is the deliverable and is ALWAYS kept, pass or fail. */
async function generateCmd(flags: Flags): Promise<void> {
  if (flags.plan && flags.edit)
    fail("--plan and --edit are different modes; pass only one");
  if (flags.plan) return planCmd(flags);
  if (flags.edit) return editCmd(flags);
  if (!flags.topic) fail("generate requires --topic");
  if (flags.html)
    fail("generate writes HTML; --html only applies to render/check");
  if (flags.provider && !PROVIDERS.includes(flags.provider as Provider))
    fail(`--provider must be one of: ${PROVIDERS.join(", ")}`);
  if (flags.engine && flags.engine !== "freeform")
    fail(
      "generate always uses the freeform engine (natural CSS/JS, no capture contract); use render for seek/vt",
    );
  const provider = resolveProvider(flags.provider);
  const outPath = flags.out ?? join("out", `${slugify(flags.topic)}.html`);

  const src = flags.mock
    ? "mock (freeform reference fixture)"
    : `${provider}/${flags.model ?? DEFAULT_MODELS[provider]}, engine freeform`;
  console.log(`generating animation HTML for "${flags.topic}" (${src})…`);
  let script: string | undefined;
  if (flags.script) script = await readFile(flags.script, "utf8");
  await mkdir(dirname(outPath), { recursive: true });
  try {
    const html = await generateHtml({
      topic: flags.topic,
      script,
      provider,
      model: flags.model,
      engine: "freeform",
      mock: flags.mock,
    });
    await writeFile(outPath, html, "utf8");
    console.log(`  wrote ${outPath}`);
  } catch (err) {
    if (err instanceof GenerationError) {
      const rawPath = outPath.replace(/\.html?$/i, "") + ".raw.txt";
      await writeFile(rawPath, err.raw, "utf8");
      die(`${err.message} Raw model output saved to ${rawPath}`);
    }
    throw err;
  }

  console.log(`gating (self-containment + headless smoke)…`);
  const result = await gateWithRepair(
    outPath,
    provider,
    flags.model,
    flags.mock,
  );
  if (!result.ok) {
    die(
      `Freeform gate FAILED for ${outPath} (file kept for inspection — open it in a browser with DevTools).`,
    );
  }
  console.log(
    `\nPASS — ${outPath}\nopen it in a browser to watch the animation`,
  );
}

/** generate --edit — step (b) of session/chat: revise an existing animation.
 *  Feeds the current HTML (--html) + an optional prior conversation (--thread) +
 *  one change request (--topic) to the editor prompt, which returns the full file
 *  with only that change applied. Same freeform gate + one auto-repair pass as a
 *  fresh generation. Writes a NEW file (…edited.html) so the source is preserved
 *  unless --out points back at it. */
async function editCmd(flags: Flags): Promise<void> {
  if (!flags.html)
    fail("generate --edit requires --html <current animation to edit>");
  if (!flags.topic)
    fail("generate --edit requires --topic <the change to make>");
  if (flags.provider && !PROVIDERS.includes(flags.provider as Provider))
    fail(`--provider must be one of: ${PROVIDERS.join(", ")}`);
  if (flags.engine && flags.engine !== "freeform")
    fail("generate --edit always uses the freeform engine (natural CSS/JS)");
  const provider = resolveProvider(flags.provider);
  const outPath =
    flags.out ?? `${flags.html.replace(/\.html?$/i, "")}.edited.html`;

  const currentHtml = await readFile(flags.html, "utf8");
  const thread = flags.thread
    ? await readFile(flags.thread, "utf8")
    : undefined;
  const src = flags.mock
    ? "mock (identity edit)"
    : `${provider}/${flags.model ?? DEFAULT_MODELS[provider]}, engine freeform`;
  console.log(`editing ${flags.html} — "${flags.topic}" (${src})…`);

  await mkdir(dirname(outPath), { recursive: true });
  try {
    const html = await editHtml({
      currentHtml,
      request: flags.topic,
      thread,
      provider,
      model: flags.model,
      mock: flags.mock,
    });
    await writeFile(outPath, html, "utf8");
    console.log(`  wrote ${outPath}`);
  } catch (err) {
    if (err instanceof GenerationError) {
      const rawPath = outPath.replace(/\.html?$/i, "") + ".raw.txt";
      await writeFile(rawPath, err.raw, "utf8");
      die(`${err.message} Raw model output saved to ${rawPath}`);
    }
    throw err;
  }

  console.log(`gating (self-containment + headless smoke)…`);
  const result = await gateWithRepair(
    outPath,
    provider,
    flags.model,
    flags.mock,
  );
  if (!result.ok) {
    die(
      `Freeform gate FAILED for ${outPath} (file kept for inspection — open it in a browser with DevTools).`,
    );
  }
  console.log(
    `\nPASS — ${outPath}\nopen it in a browser to watch the edited animation`,
  );
}

async function renderCmd(flags: Flags): Promise<void> {
  if (!flags.out) fail("--out is required");
  if (!flags.html && !flags.topic) fail("either --topic or --html is required");
  if (
    flags.fps !== undefined &&
    (!Number.isFinite(flags.fps) || flags.fps <= 0)
  )
    fail("--fps must be a positive number");
  if (flags.provider && !PROVIDERS.includes(flags.provider as Provider))
    fail(`--provider must be one of: ${PROVIDERS.join(", ")}`);
  const provider = resolveProvider(flags.provider);
  const engine = resolveEngine(flags);

  const slug = flags.html
    ? basename(flags.html).replace(/\.html?$/i, "")
    : slugify(flags.topic!);
  const workDir = join("out", slug);
  const framesDir = join(workDir, "frames");

  // 1) Obtain HTML — existing file (dev loop), mock, or freshly generated.
  let htmlPath: string;
  let repairable = false; // only real generations are repair-eligible
  if (flags.html) {
    htmlPath = flags.html;
    console.log(`using existing HTML: ${htmlPath}`);
  } else {
    const src = flags.mock
      ? `mock (${engine} reference fixture)`
      : `${provider}/${flags.model ?? DEFAULT_MODELS[provider]}, engine ${engine}`;
    console.log(`generating HTML for "${flags.topic}" (${src})…`);
    let script: string | undefined;
    if (flags.script) script = await readFile(flags.script, "utf8");
    htmlPath = join(workDir, "index.html");
    await mkdir(workDir, { recursive: true });
    try {
      const html = await generateHtml({
        topic: flags.topic!,
        script,
        provider,
        model: flags.model,
        engine,
        mock: flags.mock,
      });
      await writeFile(htmlPath, html, "utf8");
      repairable = !flags.mock;
      console.log(`  wrote ${htmlPath}`);
    } catch (err) {
      if (err instanceof GenerationError) {
        const rawPath = join(workDir, "raw.txt");
        await writeFile(rawPath, err.raw, "utf8");
        die(`${err.message} Raw model output saved to ${rawPath}`);
      }
      throw err;
    }

    // 2) Static contract gate — never encode garbage.
    console.log(`validating contract…`);
    await staticGate(htmlPath, engine);
  }

  // 3) Capture frames. For real generations, one auto-repair pass on failure.
  console.log(`capturing frames (engine: ${engine})…`);
  let cap: CaptureResult;
  try {
    cap = await capture(htmlPath, framesDir, { fps: flags.fps, engine });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!repairable) throw err; // --html / mock: surface the diagnostic
    console.log(`  capture failed:\n${indent(msg)}`);
    console.log(`auto-repairing once (${provider})…`);
    const broken = await readFile(htmlPath, "utf8");
    try {
      const fixed = await repair({
        brokenHtml: broken,
        error: msg,
        provider,
        model: flags.model,
        engine,
      });
      await writeFile(htmlPath, fixed, "utf8");
    } catch (rerr) {
      if (rerr instanceof GenerationError) {
        const rawPath = join(workDir, "raw.txt");
        await writeFile(rawPath, rerr.raw, "utf8");
        die(`Repair failed: ${rerr.message} Raw output saved to ${rawPath}`);
      }
      throw rerr;
    }
    console.log(`re-validating repaired HTML…`);
    await staticGate(htmlPath, engine);
    console.log(`re-capturing…`);
    cap = await capture(htmlPath, framesDir, { fps: flags.fps, engine }); // one attempt
  }
  console.log(
    `  ${cap.frameCount} frames @ ${cap.fps}fps (${(cap.durationMs / 1000).toFixed(2)}s)`,
  );

  // 4) Encode MP4.
  console.log(`encoding ${flags.out}…`);
  await encode(framesDir, cap.fps, flags.out);

  if (!flags.keepFrames) await rm(framesDir, { recursive: true, force: true });
  if (!flags.html && !flags.keepHtml)
    await rm(dirname(htmlPath), { recursive: true, force: true });

  console.log(`done -> ${flags.out}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === "--help" || cmd === "-h" || cmd === undefined) {
    console.log(USAGE);
    process.exit(cmd === undefined ? 1 : 0);
  }
  const flags = parseFlags(argv.slice(1));
  if (cmd === "generate") return generateCmd(flags);
  if (cmd === "render") return renderCmd(flags);
  if (cmd === "check") return checkCmd(flags);
  fail(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(`\nfailed: ${err?.message ?? err}`);
  process.exit(1);
});
