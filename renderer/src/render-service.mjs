// Toucan renderer service (Section 4 spine, now rendering the real Scene).
//
// A tiny HTTP service the Spring orchestrator dispatches to:
//   Spring  --POST /render-->  here  --POST /api/internal/render-callback-->  Spring
//
// It renders the real Remotion `Scene` composition (debt #1): bundle the project
// once, `selectComposition("Scene")` with the validated SceneSpec passed via
// `inputProps` ({ spec, themeParams }), `renderMedia` to an MP4 (+ a first-frame
// poster), then POST the artifact back on the signed callback. The validated spec
// arrives as `specJson` in the dispatch; the keyless StubLlmClient path supplies a
// known-good fixture upstream, so the offline pipeline renders unchanged here.
//
// A prompt containing FORCE_RENDER_FAILURE still drives the FAILED path.
//
// Rendering needs headless Chrome; the cloud sandbox has none, so the real render
// runs on the maintainer's box. Importing this module does NOT bundle or launch
// Chrome — that happens lazily on the first /render — so it loads fine anywhere.

import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";

const PORT = Number(process.env.RENDERER_PORT ?? 3001);
const TOKEN = process.env.INTERNAL_RENDER_TOKEN ?? "dev-internal-render-token";
const FAILURE_SENTINEL = "FORCE_RENDER_FAILURE";
const COMPOSITION_ID = "Scene";
const ENTRY_POINT = fileURLToPath(new URL("./index.ts", import.meta.url));

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { status: "ok" });
  }
  if (req.method === "POST" && req.url === "/render") {
    return readJson(req, (err, body) => {
      if (err || !body?.jobId || !body?.callbackUrl) {
        return json(res, 400, { error: "jobId and callbackUrl are required" });
      }
      // Accept immediately; report completion asynchronously (real renderers are slow).
      json(res, 202, { accepted: true, jobId: body.jobId });
      setImmediate(() => runRender(body));
    });
  }
  return json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[renderer] listening on :${PORT}`);
});

// ── real render ──

// Bundle once and reuse the serve URL across jobs (bundling is expensive). Lazy so
// that merely importing this module never triggers a webpack build.
let bundlePromise = null;
function getServeUrl() {
  if (!bundlePromise) {
    console.log("[renderer] bundling project…");
    bundlePromise = bundle({ entryPoint: ENTRY_POINT }).then((url) => {
      console.log("[renderer] bundle ready");
      return url;
    });
  }
  return bundlePromise;
}

async function runRender(job) {
  const { jobId, prompt, specJson, callbackUrl } = job;
  let workdir;
  try {
    if (typeof prompt === "string" && prompt.includes(FAILURE_SENTINEL)) {
      await callback(callbackUrl, {
        jobId,
        status: "FAILED",
        error: "Forced renderer failure (FORCE_RENDER_FAILURE sentinel).",
      });
      console.log(`[renderer] job ${jobId} -> FAILED (sentinel)`);
      return;
    }

    const spec = parseSpec(specJson);
    const themeParams = job.themeParams ?? spec?.meta?.themeParams ?? {};
    const inputProps = { spec, themeParams };

    const serveUrl = await getServeUrl();
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });

    workdir = await mkdtemp(path.join(tmpdir(), "toucan-render-"));
    const mp4Path = path.join(workdir, "video.mp4");
    const posterPath = path.join(workdir, "poster.png");

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: mp4Path,
      inputProps,
    });
    await renderStill({
      composition,
      serveUrl,
      output: posterPath,
      frame: 0,
      inputProps,
    });

    const mp4 = await readFile(mp4Path);
    const poster = await readFile(posterPath);
    const durationMs = Math.round(
      (composition.durationInFrames / composition.fps) * 1000,
    );

    await callback(
      callbackUrl,
      { jobId, status: "READY", durationMs },
      { mp4, poster },
    );
    console.log(
      `[renderer] job ${jobId} -> READY (${composition.durationInFrames}f @ ${composition.fps}fps, mp4 ${mp4.length}B)`,
    );
  } catch (e) {
    console.error(`[renderer] job ${jobId} errored:`, e);
    try {
      await callback(callbackUrl, {
        jobId,
        status: "FAILED",
        error: String(e?.message ?? e),
      });
    } catch (e2) {
      console.error(`[renderer] callback for ${jobId} also failed:`, e2);
    }
  } finally {
    if (workdir)
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseSpec(specJson) {
  if (typeof specJson !== "string" || specJson.trim() === "") {
    throw new Error("render dispatch is missing specJson");
  }
  try {
    return JSON.parse(specJson);
  } catch (e) {
    throw new Error(`specJson is not valid JSON: ${String(e?.message ?? e)}`);
  }
}

// ── signed callback ──

async function callback(url, fields, files = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  if (files.mp4)
    form.append(
      "mp4",
      new Blob([files.mp4], { type: "video/mp4" }),
      "render.mp4",
    );
  if (files.poster)
    form.append(
      "poster",
      new Blob([files.poster], { type: "image/png" }),
      "poster.png",
    );

  const res = await fetch(url, {
    method: "POST",
    headers: { "X-Internal-Token": TOKEN },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`callback ${url} returned ${res.status}`);
  }
}

// ── http helpers ──

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

function readJson(req, cb) {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    try {
      cb(null, data ? JSON.parse(data) : {});
    } catch (e) {
      cb(e);
    }
  });
  req.on("error", cb);
}
