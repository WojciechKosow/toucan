// Minimal PNG decode + tolerant compare, for the vt determinism gate.
//
// Chromium's compositor produces ±1-2 LSB anti-aliasing noise on the edges of
// transformed elements that no flag set fully pins down. That noise is invisible
// (and irrelevant to viewers), but it breaks byte-hash comparison — so the vt
// gate decodes frames and compares pixels with a tight tolerance instead. Real
// determinism bugs (wall-clock reads, randomness) move whole regions by whole
// pixels and blow far past the tolerance.
//
// Supports what CDP screenshots emit: 8-bit, non-interlaced, RGB/RGBA.

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  /** Unfiltered raw pixel bytes, row-major, no filter bytes. */
  pixels: Buffer;
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(path: string): DecodedPng {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error(`${path}: not a PNG`);
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len; // length + type + data + crc
  }

  if (bitDepth !== 8) throw new Error(`${path}: unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error(`${path}: interlaced PNG unsupported`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`${path}: unsupported color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  // Undo per-scanline filters (0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0; // left
      const b = prev ? prev[x] : 0; // up
      const c = x >= channels && prev ? prev[x - channels] : 0; // up-left
      let v = src[x];
      switch (filter) {
        case 0:
          break;
        case 1:
          v = (v + a) & 0xff;
          break;
        case 2:
          v = (v + b) & 0xff;
          break;
        case 3:
          v = (v + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default:
          throw new Error(`${path}: bad filter ${filter} on row ${y}`);
      }
      out[x] = v;
    }
  }

  return { width, height, channels, pixels };
}

export interface PixelCompareResult {
  identical: boolean;
  /** Largest per-channel absolute difference (before thresholding). */
  maxDelta: number;
  /** Fraction of pixels whose max per-channel delta EXCEEDS `threshold`. With
   *  threshold 0 this is "any channel differs"; with a small threshold it counts
   *  only perceptually meaningful differences. */
  diffFraction: number;
}

/**
 * Compare two PNGs. `threshold` is a per-channel tolerance: a pixel counts as
 * "different" only if some channel differs by MORE than `threshold`. A small
 * value (≈8/255) absorbs the sub-visual noise the vt engine can't pin down —
 * anti-aliased edges of moving elements, and the ±LSB hue phase of a
 * continuously color-animated region under Blink's 0.1ms clock quantization —
 * while a real determinism bug (a displaced element) still moves whole regions
 * by far more than the threshold and blows past any sane area bound.
 */
export function comparePng(
  aPath: string,
  bPath: string,
  threshold = 0,
): PixelCompareResult {
  const a = decodePng(aPath);
  const b = decodePng(bPath);
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    return { identical: false, maxDelta: 255, diffFraction: 1 };
  }
  const ch = a.channels;
  const total = a.width * a.height;
  let maxDelta = 0;
  let diffPixels = 0;
  for (let p = 0; p < total; p++) {
    let pixelMax = 0;
    for (let k = 0; k < ch; k++) {
      const d = Math.abs(a.pixels[p * ch + k] - b.pixels[p * ch + k]);
      if (d > pixelMax) pixelMax = d;
    }
    if (pixelMax > maxDelta) maxDelta = pixelMax;
    if (pixelMax > threshold) diffPixels++;
  }
  return {
    identical: maxDelta === 0,
    maxDelta,
    diffFraction: diffPixels / total,
  };
}
