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
/** ffmpeg gets this long for one still, then it is killed. */
export const FFMPEG_STILL_TIMEOUT_MS = 15_000;
/** Longest clip the page plays (the live converter stops at this many seconds). */
export const CLIP_MAX_SECONDS = 180;
/** The biggest PNG read back from ffmpeg (4 MP RGBA is 16 MB; PNG is smaller). */
const MAX_FFMPEG_OUT_BYTES = 24 * 1024 * 1024;

export type MediaFailure =
  | '404' | 'oversize' | 'bad-content-type' | 'robots' | 'decode' | 'timeout'
  | 'too-small' | 'no-ffmpeg' | 'no-yt-dlp';

export interface Pixels { data: Uint8Array; width: number; height: number }
export type ImageResult = { pixels: Pixels } | MediaFailure;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface MediaTools { ffmpeg: string | null; ytDlp: string | null; ffprobe: string | null }

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

/** ffmpeg, ffprobe and yt-dlp on PATH, looked up once. */
export function mediaTools(): MediaTools {
  toolsCache ??= { ffmpeg: onPath('ffmpeg'), ytDlp: onPath('yt-dlp'), ffprobe: onPath('ffprobe') };
  return toolsCache;
}

/** For tests: forget the cached lookup. */
export function resetMediaTools(): void {
  toolsCache = null;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type MediaFetchDeps = Pick<PrefetchDeps, 'now' | 'robots' | 'gate' | 'http'> & {
  /** Override tool detection (tests). */
  tools?: MediaTools;
  /** Override the clip probe (tests): what the clip at `input` holds. */
  probe?: (input: string) => Promise<ClipProbe | MediaFailure>;
  /** Override the embed resolver (tests): the direct stream URL yt-dlp would give. */
  resolve?: (embedUrl: string) => Promise<string | null>;
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
 * Fetch and decode one picture of a story. Never throws.
 */
export async function fetchImage(
  media: Pick<StoryMedia, 'url'>,
  deps: MediaFetchDeps = { now: () => new Date(), robots: createRobotsCache(), gate: passHostGate, http: fetchHttp },
): Promise<ImageResult> {
  try {
    if (!/^https?:\/\//i.test(media.url)) return '404';
    const verdict = await robotsVerdict(media.url, deps, ARTICLE_HOST_GAP_MS);
    if (verdict.kind !== 'allowed') return 'robots';
    await deps.gate(media.url, ARTICLE_HOST_GAP_MS);
    const got = await download(media.url);
    if (typeof got === 'string') return got;
    const format = sniff(got.bytes);
    let result: ImageResult;
    if (format === 'png') result = decodePng(got.bytes);
    else if (format === 'jpeg') result = decodeJpeg(got.bytes);
    else {
      const ffmpeg = (deps.tools ?? mediaTools()).ffmpeg;
      result = ffmpeg ? await decodeWithFfmpeg(ffmpeg, got.bytes) : 'no-ffmpeg';
    }
    return result;
  } catch {
    return 'decode';
  }
}

// ---------------------------------------------------------------------------
// Poster (M6): a video or embed shows a picture in the page
// ---------------------------------------------------------------------------

/** One ffmpeg still from a clip's address. The clip is read by ffmpeg itself, over http(s) only. */
function ffmpegFrameFromUrl(ffmpeg: string, url: string): Promise<ImageResult> {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, [
      '-v', 'error', ...ffmpegUrlInputOptions(), '-ss', '1', '-i', url,
      '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
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
  });
}

/** ffmpeg/ffprobe input options for reading a clip over http(s): one place for ingest and the live converter. */
export function ffmpegUrlInputOptions(): string[] {
  return ['-protocol_whitelist', 'http,https,tcp,tls,crypto', '-user_agent', BOARD_USER_AGENT];
}

/** What a clip holds, as far as playing it is concerned. */
export interface ClipProbe { hasVideo: boolean; durationSec: number | null }

/** ffprobe a clip address (or a resolved stream address). Time-limited like the still. Never throws. */
export function ffprobeClip(ffprobe: string, input: string): Promise<ClipProbe | MediaFailure> {
  return new Promise((resolve) => {
    const child = spawn(ffprobe, [
      '-v', 'error', ...ffmpegUrlInputOptions(),
      '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', input,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    let settled = false;
    const finish = (r: ClipProbe | MediaFailure): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve(r);
    };
    const timer = setTimeout(() => finish('timeout'), FFMPEG_STILL_TIMEOUT_MS);
    child.on('error', () => finish('no-ffmpeg'));
    child.stdout?.on('data', (c: Buffer) => { if (out.length < 65536) out += c.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) return finish('404');
      try {
        const j = JSON.parse(out) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
        const d = Number(j.format?.duration);
        finish({ hasVideo: (j.streams ?? []).some((x) => x.codec_type === 'video'), durationSec: Number.isFinite(d) ? d : null });
      } catch { finish('404'); }
    });
  });
}

/** The direct stream address of a YouTube/Vimeo page, from yt-dlp; null when it gives none. */
export function resolveEmbed(ytDlp: string, url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(ytDlp, ['-g', '-f', 'best[height<=480]/best', '--no-playlist', url], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.stdout?.on('data', (d: Buffer) => { out += d.toString('utf8'); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const first = out.split('\n').map((l) => l.trim()).find((l) => /^https?:\/\//.test(l));
      resolve(code === 0 && first ? first : null);
    });
  });
}

/**
 * The clip itself must play before its picture is shown: robots + host gate,
 * then (embed) yt-dlp, then ffprobe says it has a video stream and is no longer
 * than the live converter plays. null = playable, else the failure.
 */
async function verifyClip(media: Pick<StoryMedia, 'url' | 'kind'>, deps: MediaFetchDeps): Promise<MediaFailure | null> {
  if (!/^https?:\/\//i.test(media.url)) return '404';
  const tools = deps.tools ?? mediaTools();
  if (!tools.ffmpeg) return 'no-ffmpeg';
  if (!deps.probe && !tools.ffprobe) return 'no-ffmpeg';
  if (media.kind === 'embed' && !tools.ytDlp) return 'no-yt-dlp';
  const verdict = await robotsVerdict(media.url, deps, ARTICLE_HOST_GAP_MS);
  if (verdict.kind !== 'allowed') return 'robots';
  await deps.gate(media.url, ARTICLE_HOST_GAP_MS);
  let input = media.url;
  if (media.kind === 'embed') {
    const direct = await (deps.resolve ?? ((u: string) => resolveEmbed(tools.ytDlp as string, u)))(media.url);
    if (!direct) return '404';
    input = direct;
  }
  const probe = await (deps.probe ?? ((i: string) => ffprobeClip(tools.ffprobe as string, i)))(input);
  if (typeof probe === 'string') return probe;
  if (!probe.hasVideo) return '404';
  if (probe.durationSec === null) return 'decode';
  if (probe.durationSec > CLIP_MAX_SECONDS) return 'oversize';
  return null;
}

/** The page address of a YouTube/Vimeo embed, and the oEmbed endpoint that answers for it. */
export function oembedEndpoint(embedUrl: string): string | null {
  let u: URL;
  try { u = new URL(embedUrl); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const id = u.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!id) return null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    const watch = `https://www.youtube.com/watch?v=${id}`;
    return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`;
  }
  if (host === 'player.vimeo.com' || host === 'vimeo.com') {
    return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`;
  }
  return null;
}

/**
 * The picture a video or embed shows in the page. `<video poster>` goes
 * through the image path; a clip without one gives one ffmpeg frame at 1 s;
 * an embed gives its provider's oEmbed thumbnail (D9). Never throws.
 */
export async function fetchPoster(
  media: Pick<StoryMedia, 'url' | 'kind' | 'poster'>,
  deps: MediaFetchDeps = { now: () => new Date(), robots: createRobotsCache(), gate: passHostGate, http: fetchHttp },
): Promise<ImageResult> {
  try {
    if (media.kind === 'image') return await fetchImage(media, deps);
    const unplayable = await verifyClip(media, deps);
    if (unplayable) return unplayable;
    if (media.kind === 'video' && media.poster) return await fetchImage({ url: media.poster }, deps);
    if (media.kind === 'video') {
      const ffmpeg = (deps.tools ?? mediaTools()).ffmpeg as string;
      const r = await ffmpegFrameFromUrl(ffmpeg, media.url);
      return r;
    }
    const endpoint = oembedEndpoint(media.url);
    if (!endpoint) return '404';
    await deps.gate(endpoint, ARTICLE_HOST_GAP_MS);
    const res = await deps.http(endpoint, { timeoutMs: ARTICLE_FETCH_TIMEOUT_MS, userAgent: BOARD_USER_AGENT, accept: 'application/json' });
    if (res.status !== 200 || res.body === null) return '404';
    const thumb = (JSON.parse(res.body) as { thumbnail_url?: unknown }).thumbnail_url;
    if (typeof thumb !== 'string') return '404';
    return await fetchImage({ url: thumb }, deps);
  } catch {
    return 'decode';
  }
}
