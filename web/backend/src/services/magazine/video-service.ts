/**
 * MAGAZINE LIVE VIDEO CONVERSION (plan 2026-10-19-mag-linked-media-ascii, M6b).
 *
 * One job per (clip URL, size): ffmpeg decodes to raw RGB at a small fixed
 * size, each frame goes through the SDK converter (with temporal state), is
 * packed as a livechat codec packet and appended to
 * `<boardRoot()>/Magazine/video/<hash>-v<VIDEO_FILE_VERSION>-<cols>x<rows>.frames`. The door
 * tails that file (sdk/formats/magazine-video.ts documents the layout). The
 * end marker is written last; a cut-off run (kill, error, timeout, length
 * cap) removes its partial file and is never marked complete. At most two
 * ffmpeg processes run at once; the cache is capped with oldest-use-first
 * eviction, never touching a file a job is writing.
 */
import { spawn as nodeSpawn, type ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  createTemporalState,
  encodeRichFrame,
  frameToAnsiCells,
  isKeyframeDue,
  type AnsiCellGrid,
  type RichFrame,
} from '@amiexpress/bbs-door-sdk/media/ascii';
import {
  BROTLI_MAGIC,
  REC_END,
  REC_FRAME,
  REC_HEADER,
  VIDEO_FILE_VERSION,
  readFrames,
  registerMagazineVideoService,
  type ClipHandle,
  type ClipInfo,
  type ClipOutcome,
  type ClipRequest,
  type MagazineVideoService,
} from '@amiexpress/bbs-door-sdk/formats/magazine-video';
import { passHostGate } from '../news-bulletins';
import { boardRoot } from '../../utils/board-root.util';
import { CLIP_MAX_SECONDS, ffmpegUrlInputOptions, mediaTools, resolveEmbed, type MediaTools } from './media-fetch';
import {
  ARTICLE_HOST_GAP_MS,
  fetchHttp,
  robotsByProcess,
  robotsVerdict,
  type PrefetchDeps,
} from './body-prefetch';

export const MAX_FFMPEG = 2;
export const CACHE_CAP_BYTES = 500 * 1024 * 1024;
export { CLIP_MAX_SECONDS };
/** Whole-run wall clock for one conversion. */
export const JOB_TIMEOUT_MS = 15 * 60 * 1000;
export const FRAMES_PER_CHUNK = 10;

/** ffmpeg output is this many pixels per cell each way (rows are half-height cells). */
const PX_X = 2;
const PX_Y = 4;

export interface VideoServiceDeps {
  dir: string;
  tools: () => MediaTools;
  spawn: (cmd: string, args: string[]) => ChildProcess;
  /** The input ffmpeg reads (a local temp file or URL) or a failure; `cleanup` always runs. */
  prepare: (req: ClipRequest, tools: MediaTools) => Promise<{ input: string; cleanup: () => void } | ClipOutcome>;
  fpsFor: (palette: ClipRequest['palette']) => number;
  cacheCapBytes: number;
  maxFfmpeg: number;
  maxFrames: (fps: number) => number;
  timeoutMs: number;
  /** Frames between keyframes; Infinity = only the first frame (the plan's cache tuning). */
  keyframeInterval: number;
}

/** The cache key of a clip: its URL, not any story. */
export function clipUrlHash(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function clipFile(dir: string, req: ClipRequest): string {
  return path.join(dir, `${clipUrlHash(req.url)}-v${VIDEO_FILE_VERSION}-${req.cols}x${req.rows}.frames`);
}

/** Every cached size of one clip (any version), for retention. */
export function clipFilesFor(dir: string, url: string): string[] {
  const prefix = `${clipUrlHash(url)}-v`;
  try {
    return fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith('.frames')).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

function record(type: number, body: Uint8Array): Buffer {
  const out = Buffer.alloc(5 + body.length);
  out.writeUInt32BE(1 + body.length, 0);
  out[4] = type;
  out.set(body, 5);
  return out;
}

function chunk(records: Buffer[]): Buffer {
  const gz = zlib.gzipSync(Buffer.concat(records));
  const head = Buffer.alloc(4);
  head.writeUInt32BE(gz.length, 0);
  return Buffer.concat([head, gz]);
}

function cellsToFrame(grid: AnsiCellGrid, cols: number, rows: number): RichFrame {
  const dots = new Uint8Array(cols * rows);
  const colors = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = grid[y][x];
      dots[y * cols + x] = c.char.charCodeAt(0) & 0xff;
      colors[y * cols + x] = (c.fg & 15) | ((c.bg & 15) << 4);
    }
  }
  return { dots, colors };
}

/** True when the gzip-form file ends in an end marker (a finished clip not yet recompressed). */
function isFinished(file: string): boolean {
  try { return readFrames(file).complete; } catch { return false; }
}

export function createVideoService(overrides: Partial<VideoServiceDeps> = {}): MagazineVideoService & {
  /** For tests: how many ffmpeg processes were spawned. */
  spawned: () => number;
  evict: () => void;
} {
  const deps: VideoServiceDeps = {
    dir: path.join(boardRoot(), 'Magazine', 'video'),
    tools: mediaTools,
    spawn: (cmd, args) => nodeSpawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
    prepare: defaultPrepare,
    fpsFor: (p) => (p === 'c64' ? 5 : 10),
    cacheCapBytes: CACHE_CAP_BYTES,
    maxFfmpeg: MAX_FFMPEG,
    maxFrames: (fps) => fps * CLIP_MAX_SECONDS,
    timeoutMs: JOB_TIMEOUT_MS,
    keyframeInterval: Infinity,
    ...overrides,
  };
  const jobs = new Map<string, ClipHandle>();
  const writing = new Set<string>();
  const waiting: Array<() => void> = [];
  let running = 0;
  let spawned = 0;

  const slot = (): Promise<void> => new Promise((resolve) => {
    const go = (): void => { running++; resolve(); };
    if (running < deps.maxFfmpeg) go(); else waiting.push(go);
  });
  const release = (): void => { running--; waiting.shift()?.(); };

  function evict(): void {
    let entries: Array<{ file: string; size: number; used: number }>;
    try {
      entries = fs.readdirSync(deps.dir).filter((f) => f.endsWith('.frames')).map((f) => {
        const file = path.join(deps.dir, f);
        const st = fs.statSync(file);
        return { file, size: st.size, used: Math.max(st.mtimeMs, st.atimeMs) };
      });
    } catch { return; }
    let total = entries.reduce((a, e) => a + e.size, 0);
    entries.sort((a, b) => a.used - b.used);
    for (const e of entries) {
      if (total <= deps.cacheCapBytes) break;
      if (writing.has(e.file)) continue;
      try { fs.unlinkSync(e.file); total -= e.size; } catch { /* gone */ }
    }
  }

  function recompress(file: string): void {
    try {
      const members = fs.readFileSync(file);
      const parts: Buffer[] = [];
      for (let at = 0; at + 4 <= members.length;) {
        const n = members.readUInt32BE(at);
        parts.push(zlib.gunzipSync(members.subarray(at + 4, at + 4 + n)));
        at += 4 + n;
      }
      const br = zlib.brotliCompressSync(Buffer.concat(parts), {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
          [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
        },
      });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, Buffer.concat([BROTLI_MAGIC, br]));
      fs.renameSync(tmp, file);
    } catch { /* keep the gzip form: still a complete clip */ }
  }

  async function run(req: ClipRequest, file: string): Promise<ClipOutcome> {
    const tools = deps.tools();
    if (!tools.ffmpeg) return 'no-ffmpeg';
    if (req.kind === 'embed' && !tools.ytDlp) return 'no-yt-dlp';
    const src = await deps.prepare(req, tools);
    if (typeof src === 'string') return src;
    writing.add(file);
    let fd: number | null = null;
    try {
      await slot();
      try {
        fs.mkdirSync(deps.dir, { recursive: true });
        evict();
        fd = fs.openSync(file, 'w');
        const fps = deps.fpsFor(req.palette);
        const w = req.cols * PX_X;
        const h = req.rows * PX_Y;
        const info: ClipInfo = { v: VIDEO_FILE_VERSION, cols: req.cols, rows: req.rows, fps };
        let pending: Buffer[] = [record(REC_HEADER, Buffer.from(JSON.stringify(info)))];
        const flush = (): void => {
          if (!pending.length || fd === null) return;
          fs.writeSync(fd, chunk(pending));
          pending = [];
        };
        const args = [
          '-v', 'error', ...(/^https?:\/\//i.test(src.input) ? ffmpegUrlInputOptions() : []), '-i', src.input, '-an',
          '-vf', `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
          '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
        ];
        spawned++;
        const child = deps.spawn(tools.ffmpeg, args);
        const frameBytes = w * h * 3;
        const maxFrames = deps.maxFrames(fps);
        const state = createTemporalState();
        let buf: Buffer = Buffer.alloc(0);
        let prev: RichFrame | null = null;
        let sinceKey = 0;
        let count = 0;
        let failure: ClipOutcome | null = null;

        const outcome = await new Promise<ClipOutcome>((resolve) => {
          const stop = (why: ClipOutcome): void => {
            if (failure) return;
            failure = why;
            try { child.kill('SIGKILL'); } catch { /* gone */ }
          };
          const timer = setTimeout(() => stop('timeout'), deps.timeoutMs);
          child.stdout?.on('data', (d: Buffer) => {
            if (failure) return;
            buf = buf.length ? Buffer.concat([buf, d]) : d;
            try {
              while (buf.length >= frameBytes) {
                if (count >= maxFrames) { stop('oversize'); return; }
                const px = new Uint8Array(buf.subarray(0, frameBytes));
                buf = buf.subarray(frameBytes);
                const grid = frameToAnsiCells({ data: px, width: w, height: h }, req.cols, req.rows, {
                  palette: req.palette, state,
                });
                const frame = cellsToFrame(grid, req.cols, req.rows);
                const key = isKeyframeDue(sinceKey, deps.keyframeInterval);
                const pkt = encodeRichFrame(frame, req.cols, req.rows, key ? null : prev);
                sinceKey = key ? 1 : sinceKey + 1;
                prev = frame;
                count++;
                pending.push(record(REC_FRAME, new Uint8Array(pkt)));
                if (pending.length >= FRAMES_PER_CHUNK) flush();
              }
            } catch { stop('decode'); }
          });
          child.on('error', () => { clearTimeout(timer); resolve(failure ?? 'decode'); });
          child.on('close', (code: number | null) => {
            clearTimeout(timer);
            if (failure) return resolve(failure);
            if (code !== 0 || count === 0) return resolve('decode');
            try {
              pending.push(record(REC_END, new Uint8Array(0)));
              flush();
              resolve('complete');
            } catch { resolve('decode'); }
          });
        });
        if (outcome === 'complete') {
          fs.closeSync(fd);
          fd = null;
          recompress(file);
        }
        return outcome;
      } finally {
        release();
      }
    } finally {
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* closed */ } }
      writing.delete(file);
      src.cleanup();
    }
  }

  return {
    spawned: () => spawned,
    evict,
    requestClip(req: ClipRequest): ClipHandle {
      const file = clipFile(deps.dir, req);
      const live = jobs.get(file);
      if (live) return live;
      if (fs.existsSync(file)) {
        if (isFinished(file)) {
          const now = new Date();
          try { fs.utimesSync(file, now, now); } catch { /* read-only */ }
          return { path: file, done: Promise.resolve('complete') };
        }
        try { fs.unlinkSync(file); } catch { /* raced */ }
      }
      const done = run(req, file).then(
        (r) => r,
        () => 'decode' as ClipOutcome,
      ).then((r) => {
        if (r !== 'complete') { try { fs.unlinkSync(file); } catch { /* none */ } }
        jobs.delete(file);
        return r;
      });
      const handle: ClipHandle = { path: file, done };
      jobs.set(file, handle);
      return handle;
    },
  };
}

/** Exported for the regression test. */
export async function defaultPrepare(req: ClipRequest, tools: MediaTools): Promise<{ input: string; cleanup: () => void } | ClipOutcome> {
  if (!/^https?:\/\//i.test(req.url)) return '404';
  const robotsDeps: Pick<PrefetchDeps, 'now' | 'robots' | 'gate' | 'http'> = {
    now: () => new Date(), robots: robotsByProcess, gate: passHostGate, http: fetchHttp,
  };
  try {
    const verdict = await robotsVerdict(req.url, robotsDeps, ARTICLE_HOST_GAP_MS);
    if (verdict.kind !== 'allowed') return 'robots';
    await passHostGate(req.url, ARTICLE_HOST_GAP_MS);
    if (req.kind === 'embed') {
      const direct = await resolveEmbed(tools.ytDlp as string, req.url);
      return direct ? { input: direct, cleanup: () => undefined } : '404';
    }
    return { input: req.url, cleanup: () => undefined };
  } catch {
    return '404';
  }
}

/** Backend startup: make the service reachable by the MAG door (one per process). */
export function startMagazineVideoService(): void {
  registerMagazineVideoService(createVideoService());
}
