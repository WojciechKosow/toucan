#!/usr/bin/env node
// Step 7 — CLI: ties generation + capture + encode together.
//
//   toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
//     [--script path.txt]   beat-by-beat brief appended to the topic
//     [--html path.html]    skip generation, capture an existing file (dev loop)
//     [--model gpt-4.1]
//     [--fps 30]            override the HTML's declared fps
//     [--keep-frames]       don't delete PNG frames after encode
//     [--keep-html]         don't delete generated HTML after encode

import "dotenv/config";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { capture } from "./capture.js";
import { encode } from "./encode.js";
import { DEFAULT_MODEL, GenerationError, generate } from "./generate.js";

interface Flags {
  topic?: string;
  script?: string;
  html?: string;
  model?: string;
  out?: string;
  fps?: number;
  keepFrames: boolean;
  keepHtml: boolean;
}

const VALUE_FLAGS: Record<string, keyof Flags> = {
  "--topic": "topic",
  "--script": "script",
  "--html": "html",
  "--model": "model",
  "--out": "out",
  "--fps": "fps",
};
const BOOL_FLAGS: Record<string, keyof Flags> = {
  "--keep-frames": "keepFrames",
  "--keep-html": "keepHtml",
};

const USAGE = `toucan-motion — topic -> explainer MP4 (v0.1)

Usage:
  toucan-motion render --topic "<topic>" --out <file.mp4> [options]
  toucan-motion render --html <file.html> --out <file.mp4> [options]

Options:
  --topic <text>     Topic to explain (required unless --html).
  --out <file.mp4>   Output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --model <id>       Anthropic model (default: ${DEFAULT_MODEL}).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.

Examples:
  toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
  toucan-motion render --html fixtures/reference.html --out out/ref.mp4`;

function parseFlags(args: string[]): Flags {
  const flags: Flags = { keepFrames: false, keepHtml: false };
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "scene"
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === "--help" || cmd === "-h" || cmd === undefined) {
    console.log(USAGE);
    process.exit(cmd === undefined ? 1 : 0);
  }
  if (cmd !== "render") fail(`Unknown command: ${cmd}`);

  const flags = parseFlags(argv.slice(1));
  if (!flags.out) fail("--out is required");
  if (!flags.html && !flags.topic) fail("either --topic or --html is required");
  if (flags.fps !== undefined && (!Number.isFinite(flags.fps) || flags.fps <= 0))
    fail("--fps must be a positive number");

  const slug = flags.html
    ? basename(flags.html).replace(/\.html?$/i, "")
    : slugify(flags.topic!);
  const workDir = join("out", slug);
  const framesDir = join(workDir, "frames");

  // 1) Obtain HTML — either an existing file (dev loop) or freshly generated.
  let htmlPath: string;
  let generated = false;
  if (flags.html) {
    htmlPath = flags.html;
    console.log(`[1/3] using existing HTML: ${htmlPath}`);
  } else {
    console.log(
      `[1/3] generating HTML for "${flags.topic}" (${flags.model ?? DEFAULT_MODEL})…`,
    );
    let script: string | undefined;
    if (flags.script) {
      script = await readFile(flags.script, "utf8");
    }
    htmlPath = join(workDir, "index.html");
    await mkdir(workDir, { recursive: true });
    try {
      const html = await generate({
        topic: flags.topic!,
        script,
        model: flags.model,
      });
      await writeFile(htmlPath, html, "utf8");
      generated = true;
      console.log(`      wrote ${htmlPath}`);
    } catch (err) {
      if (err instanceof GenerationError) {
        const rawPath = join(workDir, "raw.txt");
        await writeFile(rawPath, err.raw, "utf8");
        fail(`${err.message} Raw model output saved to ${rawPath}`);
      }
      throw err;
    }
  }

  // 2) Capture frames.
  console.log(`[2/3] capturing frames…`);
  const cap = await capture(htmlPath, framesDir, { fps: flags.fps });
  console.log(
    `      ${cap.frameCount} frames @ ${cap.fps}fps (${(cap.durationMs / 1000).toFixed(2)}s)`,
  );

  // 3) Encode MP4.
  console.log(`[3/3] encoding ${flags.out}…`);
  await encode(framesDir, cap.fps, flags.out);

  // Cleanup.
  if (!flags.keepFrames) await rm(framesDir, { recursive: true, force: true });
  if (generated && !flags.keepHtml)
    await rm(dirname(htmlPath), { recursive: true, force: true });

  console.log(`done -> ${flags.out}`);
}

main().catch((err) => {
  console.error(`\nrender failed: ${err?.message ?? err}`);
  process.exit(1);
});
