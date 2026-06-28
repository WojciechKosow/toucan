// Step 4 — encode: a directory of PNG frames -> one MP4, via the ffmpeg-static
// binary (no system ffmpeg dependency). No audio in v0.1.

import { spawn } from "node:child_process";
import { chmod } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

export async function encode(
  framesDir: string,
  fps: number,
  outPath: string,
): Promise<string> {
  // ffmpeg-static is the portable default (no system dependency). FFMPEG_PATH is
  // an escape hatch for environments where the static build doesn't run.
  const ffmpeg =
    process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null);
  if (!ffmpeg) {
    throw new Error(
      "No ffmpeg binary. Install deps (ffmpeg-static) or set FFMPEG_PATH.",
    );
  }

  // ffmpeg-static occasionally lands without the execute bit; make sure it runs.
  await chmod(ffmpeg, 0o755).catch(() => {});

  await mkdir(dirname(outPath), { recursive: true });

  const args = [
    "-y",
    // bitexact + stripped metadata so the same frames always encode to the same
    // bytes (ffmpeg otherwise stamps a wall-clock creation_time into the MP4).
    "-fflags",
    "+bitexact",
    "-framerate",
    String(fps),
    "-i",
    join(framesDir, "frame-%05d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "18",
    "-map_metadata",
    "-1",
    "-movflags",
    "+faststart",
    outPath,
  ];

  await new Promise<void>((resolveRun, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(
            `ffmpeg exited with code ${code}.\n${stderr.split("\n").slice(-20).join("\n")}`,
          ),
        );
    });
  });

  return outPath;
}
