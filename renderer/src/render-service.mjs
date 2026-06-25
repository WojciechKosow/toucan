// Toucan renderer service (Section 4 — orchestration spine).
//
// A tiny, dependency-free HTTP service that proves the async render lifecycle:
//   Spring  --POST /render-->  here  --POST /api/internal/render-callback-->  Spring
//
// It does NOT render real compositions yet — that's Section 3. Until then it returns a
// PLACEHOLDER MP4 (a structurally valid ftyp+mdat container) plus a 1x1 poster PNG, so the
// end-to-end spine (queue -> dispatch -> callback -> storage -> READY) can be exercised.
// A prompt containing FORCE_RENDER_FAILURE drives the FAILED path instead.

import http from "node:http";
import zlib from "node:zlib";

const PORT = Number(process.env.RENDERER_PORT ?? 3001);
const TOKEN = process.env.INTERNAL_RENDER_TOKEN ?? "dev-internal-render-token";
const FAILURE_SENTINEL = "FORCE_RENDER_FAILURE";

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { status: "ok" });
  }
  if (req.method === "POST" && req.url === "/render") {
    return readJson(req, (err, body) => {
      if (err || !body?.jobId || !body?.callbackUrl) {
        return json(res, 400, { error: "jobId and callbackUrl are required" });
      }
      // Accept the work immediately; report completion asynchronously (mirrors a real renderer).
      json(res, 202, { accepted: true, jobId: body.jobId });
      setImmediate(() => runRender(body));
    });
  }
  return json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[renderer] listening on :${PORT}`);
});

async function runRender(job) {
  const { jobId, animationId, prompt, callbackUrl } = job;
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

    const mp4 = makePlaceholderMp4(animationId);
    const poster = makePlaceholderPng();
    await callback(
      callbackUrl,
      { jobId, status: "READY", durationMs: 3000 },
      { mp4, poster },
    );
    console.log(
      `[renderer] job ${jobId} -> READY (placeholder mp4 ${mp4.length}B)`,
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
  }
}

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

// ── placeholder artifacts ──

/** A structurally valid (non-playable) MP4: ftyp + mdat. Clearly a placeholder, not a fake codec. */
function makePlaceholderMp4(animationId) {
  const ftyp = box(
    "ftyp",
    Buffer.from("isom", "ascii"),
    u32(0x200),
    Buffer.from("isomiso2avc1mp41", "ascii"),
  );
  const note = Buffer.from(
    `toucan placeholder render for ${animationId} — real compositions land in Section 3`,
    "utf8",
  );
  return Buffer.concat([ftyp, box("mdat", note)]);
}

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([
    u32(8 + body.length),
    Buffer.from(type, "ascii"),
    body,
  ]);
}

/** A valid 1x1 black PNG, built with zlib + zlib.crc32 (Node >= 22.2). */
function makePlaceholderPng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = pngChunk(
    "IHDR",
    Buffer.concat([u32(1), u32(1), Buffer.from([8, 2, 0, 0, 0])]),
  );
  const idat = pngChunk("IDAT", zlib.deflateSync(Buffer.from([0, 0, 0, 0])));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const crc = u32(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([u32(data.length), typeBuf, data, crc]);
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

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
