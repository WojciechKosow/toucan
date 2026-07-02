#!/usr/bin/env node
// Step 7 — CLI: ties generation + capture + encode together.
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
import { capture, type CaptureResult } from "./capture.js";
import { encode } from "./encode.js";
import {
  DEFAULT_MODELS,
  GenerationError,
  PROVIDERS,
  type Provider,
  generateHtml,
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
  html?: string;
  model?: string;
  provider?: string;
  out?: string;
  fps?: number;
  mock: boolean;
  keepFrames: boolean;
  keepHtml: boolean;
}

const VALUE_FLAGS: Record<string, keyof Flags> = {
  "--topic": "topic",
  "--script": "script",
  "--html": "html",
  "--model": "model",
  "--provider": "provider",
  "--out": "out",
  "--fps": "fps",
};
const BOOL_FLAGS: Record<string, keyof Flags> = {
  "--mock": "mock",
  "--keep-frames": "keepFrames",
  "--keep-html": "keepHtml",
};

const USAGE = `toucan-motion — topic -> explainer MP4 (v0.1)

Usage:
  toucan-motion render --topic "<topic>" --out <file.mp4> [options]
  toucan-motion render --html <file.html> --out <file.mp4> [options]
  toucan-motion check  --html <file.html>

render options:
  --topic <text>     Topic to explain (required unless --html).
  --out <file.mp4>   Output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --mock             Use fixtures/reference.html instead of the API (no key, no spend).
  --provider <name>  openai | anthropic (default: openai, or whichever key is set).
  --model <id>       Model id (default: ${DEFAULT_MODELS.openai} for openai, ${DEFAULT_MODELS.anthropic} for anthropic).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.

check:
  --html <file>      Run the static contract gate + determinism check; print PASS/FAIL.

Examples:
  toucan-motion render --topic "how a shopping site works" --mock --out out/mock.mp4
  toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
  toucan-motion check  --html fixtures/reference.html`;

function parseFlags(args: string[]): Flags {
  const flags: Flags = { mock: false, keepFrames: false, keepHtml: false };
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

async function checkCmd(flags: Flags): Promise<void> {
  if (!flags.html) fail("check requires --html <file>");
  console.log(`check ${flags.html}`);
  const { static: staticResult, runtime } = await validateFile(flags.html);
  report("static contract", staticResult);
  report("runtime determinism", runtime);
  const ok = staticResult.ok && runtime.ok;
  console.log(`\n${ok ? "PASS" : "FAIL"} — ${flags.html}`);
  process.exit(ok ? 0 : 1);
}

/** Static-gate freshly written HTML; on failure keep the file and exit non-zero. */
async function staticGate(htmlPath: string): Promise<void> {
  const res = validateHtml(await readFile(htmlPath, "utf8"));
  for (const w of res.warnings) console.log(`      warn: ${w}`);
  if (!res.ok) {
    for (const e of res.errors) console.log(`      error: ${e}`);
    die(
      `Contract validation FAILED for ${htmlPath} (kept for inspection). Not encoding.`,
    );
  }
  console.log(`      contract OK`);
}

async function renderCmd(flags: Flags): Promise<void> {
  if (!flags.out) fail("--out is required");
  if (!flags.html && !flags.topic) fail("either --topic or --html is required");
  if (flags.fps !== undefined && (!Number.isFinite(flags.fps) || flags.fps <= 0))
    fail("--fps must be a positive number");
  if (flags.provider && !PROVIDERS.includes(flags.provider as Provider))
    fail(`--provider must be one of: ${PROVIDERS.join(", ")}`);
  const provider = resolveProvider(flags.provider);

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
      ? "mock (fixtures/reference.html)"
      : `${provider}/${flags.model ?? DEFAULT_MODELS[provider]}`;
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
    await staticGate(htmlPath);
  }

  // 3) Capture frames. For real generations, one auto-repair pass on failure.
  console.log(`capturing frames…`);
  let cap: CaptureResult;
  try {
    cap = await capture(htmlPath, framesDir, { fps: flags.fps });
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
    await staticGate(htmlPath);
    console.log(`re-capturing…`);
    cap = await capture(htmlPath, framesDir, { fps: flags.fps }); // one attempt
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
  if (cmd === "render") return renderCmd(flags);
  if (cmd === "check") return checkCmd(flags);
  fail(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(`\nfailed: ${err?.message ?? err}`);
  process.exit(1);
});
