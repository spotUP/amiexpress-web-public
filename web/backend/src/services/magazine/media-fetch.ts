/**
 * MAGAZINE MEDIA FETCH (plan 2026-10-19-mag-linked-media-ascii, M4/M5).
 *
 * One picture of a story, fetched with the same manners as the story page
 * (host gate, robots.txt of the picture's own host, honest agent, 15 s) and
 * decoded to RGBA pixels. A failure is a reason string (D6), never a throw:
 * the caller records it once on the story and does not retry.
 *
 * PNG -> pngjs, JPEG -> jpeg-js (no process per image). WebP, GIF, AVIF ->
 * ffmpeg, first frame (D10): the bytes go to ffmpeg's stdin, one PNG comes
 * back on stdout (so the size arrives with the pixels, and the 4 MP cap is
 * read from the PNG header before pngjs decodes it).
 */
import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';
import type { StoryMedia } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { passHostGate } from '../news-bulletins';
import {
  ARTICLE_FETCH_TIMEOUT_MS,
  ARTICLE_HOST_GAP_MS,
  BOARD_USER_AGENT,
  createRobotsCache,
  fetchHttp,
  robotsVerdict,
  type PrefetchDeps,
} from './body-prefetch';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 4_000_000;
export const MIN_IMAGE_SIDE = 100;
export const STORY_MAX_PICTURES = 8;
export const STORY_MAX_BYTES = 12 * 1024 * 1024;
export const STORY_MAX_WALL_MS = 90_000;
/** ffmpeg gets this long for one still, then it is killed. */
export const FFMPEG_STILL_TIMEOUT_MS = 15_000;
/** The biggest PNG read back from ffmpeg (4 MP RGBA is 16 MB; PNG is smaller). */
const MAX_FFMPEG_OUT_BYTES = 24 * 1024 * 1024;

export type MediaFailure =
  | '404' | 'oversize' | 'bad-content-type' | 'robots' | 'decode' | 'timeout'
  | 'too-small' | 'story-cap' | 'no-ffmpeg' | 'no-yt-dlp';

export interface Pixels { data: Uint8Array; width: number; height: number }
export type ImageResult = { pixels: Pixels } | MediaFailure;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface MediaTools { ffmpeg: string | null; ytDlp: string | null }

function onPath(name: string, envPath = process.env.PATH ?? ''): string | null {
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, name);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      if (fs.statSync(full).isFile()) return full;
    } catch { /* next */ }
  }
  return null;
}

let toolsCache: MediaTools | null = null;

/** ffmpeg and yt-dlp on PATH, looked up once. */
export function mediaTools(): MediaTools {
  toolsCache ??= { ffmpeg: onPath('ffmpeg'), ytDlp: onPath('yt-dlp') };
  return toolsCache;
}

/** For tests: forget the cached lookup. */
export function resetMediaTools(): void {
  toolsCache = null;
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/** One story's allowance, shared by every call for that story. */
export interface MediaBudget {
  pictures: number;
  bytes: number;
  startedAt: number;
  now: () => number;
}

export function createMediaBudget(now: () => number = Date.now): MediaBudget {
  return { pictures: 0, bytes: 0, startedAt: now(), now };
}

function budgetSpent(b: MediaBudget): boolean {
  return b.pictures >= STORY_MAX_PICTURES || b.bytes >= STORY_MAX_BYTES || b.now() - b.startedAt >= STORY_MAX_WALL_MS;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type MediaFetchDeps = Pick<PrefetchDeps, 'now' | 'robots' | 'gate' | 'http'> & {
  /** Override tool detection (tests). */
  tools?: MediaTools;
};

type Download = { bytes: Buffer; contentType: string } | MediaFailure;

async function download(url: string): Promise<Download> {
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      timeout: ARTICLE_FETCH_TIMEOUT_MS,
      signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
      responseType: 'arraybuffer',
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': BOARD_USER_AGENT, Accept: 'image/*' },
    });
    if (res.status < 200 || res.status >= 300) return '404';
    const contentType = String(res.headers?.['content-type'] ?? '').toLowerCase();
    if (!contentType.startsWith('image/')) return 'bad-content-type';
    const declared = Number(res.headers?.['content-length']);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return 'oversize';
    const bytes = Buffer.from(res.data);
    if (bytes.length > MAX_IMAGE_BYTES) return 'oversize';
    return { bytes, contentType };
  } catch (err) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ERR_BAD_RESPONSE' || /maxContentLength|maxBodyLength/i.test(e.message ?? '')) return 'oversize';
    if (e.code === 'ECONNABORTED' || e.code === 'ERR_CANCELED' || e.name === 'TimeoutError' || e.name === 'AbortError') return 'timeout';
    return '404'; // unreachable host, refused, DNS: the picture is not there
  }
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

type Format = 'png' | 'jpeg' | 'other';

function sniff(b: Buffer): Format {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  return 'other';
}

function pngSize(b: Buffer): { width: number; height: number } | null {
  return b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR' ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
}

/** Width/height from the first SOF marker, without decoding. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** Size gate shared by every format; null = fine. */
function sizeVerdict(s: { width: number; height: number } | null): MediaFailure | null {
  if (!s || s.width < 1 || s.height < 1) return 'decode';
  if (s.width * s.height > MAX_IMAGE_PIXELS) return 'oversize';
  if (s.width < MIN_IMAGE_SIDE || s.height < MIN_IMAGE_SIDE) return 'too-small';
  return null;
}

function decodePng(b: Buffer): ImageResult {
  const bad = sizeVerdict(pngSize(b));
  if (bad) return bad;
  try {
    const png = PNG.sync.read(b);
    return { pixels: { data: new Uint8Array(png.data), width: png.width, height: png.height } };
  } catch { return 'decode'; }
}

function decodeJpeg(b: Buffer): ImageResult {
  const bad = sizeVerdict(jpegSize(b));
  if (bad) return bad;
  try {
    const img = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
    return { pixels: { data: img.data, width: img.width, height: img.height } };
  } catch { return 'decode'; }
}

/** First frame of anything ffmpeg reads, as PNG on stdout, then the PNG path. */
function decodeWithFfmpeg(ffmpeg: string, input: Buffer): Promise<ImageResult> {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const out: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (r: ImageResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve(r);
    };
    const timer = setTimeout(() => finish('timeout'), FFMPEG_STILL_TIMEOUT_MS);
    child.on('error', () => finish('no-ffmpeg'));
    child.stdout.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_FFMPEG_OUT_BYTES) return finish('oversize');
      out.push(c);
    });
    child.on('close', () => {
      const png = Buffer.concat(out);
      finish(png.length ? decodePng(png) : 'decode');
    });
    child.stdin.on('error', () => { /* ffmpeg closed early; close handler reports */ });
    child.stdin.end(input);
  });
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

/**
 * Fetch and decode one picture of a story. Never throws. `budget` is the
 * story's shared allowance; a picture past it is 'story-cap'.
 */
export async function fetchImage(
  media: Pick<StoryMedia, 'url'>,
  budget: MediaBudget,
  deps: MediaFetchDeps = { now: () => new Date(), robots: createRobotsCache(), gate: passHostGate, http: fetchHttp },
): Promise<ImageResult> {
  try {
    if (budgetSpent(budget)) return 'story-cap';
    if (!/^https?:\/\//i.test(media.url)) return '404';
    const verdict = await robotsVerdict(media.url, deps, ARTICLE_HOST_GAP_MS);
    if (verdict.kind !== 'allowed') return 'robots';
    await deps.gate(media.url, ARTICLE_HOST_GAP_MS);
    const got = await download(media.url);
    if (typeof got === 'string') return got;
    budget.bytes += got.bytes.length;
    const format = sniff(got.bytes);
    let result: ImageResult;
    if (format === 'png') result = decodePng(got.bytes);
    else if (format === 'jpeg') result = decodeJpeg(got.bytes);
    else {
      const ffmpeg = (deps.tools ?? mediaTools()).ffmpeg;
      result = ffmpeg ? await decodeWithFfmpeg(ffmpeg, got.bytes) : 'no-ffmpeg';
    }
    if (typeof result !== 'string') budget.pictures++;
    return result;
  } catch {
    return 'decode';
  }
}
