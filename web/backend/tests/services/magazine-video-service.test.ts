import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { createVideoService } from '../../src/services/magazine/video-service';
import {
  getMagazineVideoService,
  newFrameCursor,
  readFrames,
  richFrameToCells,
  registerMagazineVideoService,
  type ClipRequest,
} from '@amiexpress/bbs-door-sdk/formats/magazine-video';

const COLS = 8;
const ROWS = 4;
const FRAME_BYTES = COLS * 2 * ROWS * 4 * 3;
const REQ: ClipRequest = { url: 'https://example.com/a.mp4', kind: 'video', cols: COLS, rows: ROWS, palette: 'amiga16' };

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill(): boolean { this.killed = true; this.emit('close', null); return true; }
  finish(code = 0): void { this.stdout.end(); setImmediate(() => this.emit('close', code)); }
  frame(n: number): void {
    const b = Buffer.alloc(FRAME_BYTES);
    for (let i = 0; i < FRAME_BYTES; i++) b[i] = (i * 7 + n * 40) & 0xff;
    this.stdout.write(b);
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
let dir: string;
let kids: FakeChild[];

function make(over = {}) {
  kids = [];
  return createVideoService({
    dir,
    tools: () => ({ ffmpeg: '/bin/ffmpeg', ytDlp: null }),
    spawn: () => { const k = new FakeChild(); kids.push(k); return k as unknown as ChildProcess; },
    prepare: async () => ({ input: 'x', cleanup: () => undefined }),
    ...over,
  });
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magvid-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('magazine video service', () => {
  it('fills the cache, marks complete last, recompresses to brotli; frames round-trip', async () => {
    const svc = make();
    const h = svc.requestClip(REQ);
    await tick();
    for (let i = 0; i < 12; i++) kids[0].frame(i);
    await tick();
    const mid = readFrames(h.path);
    expect(mid.frames.length).toBeGreaterThan(0);
    expect(mid.complete).toBe(false);
    kids[0].finish();
    expect(await h.done).toBe('complete');
    expect(fs.readFileSync(h.path).subarray(0, 4).toString()).toBe('MAGB');
    const all = readFrames(h.path);
    expect(all.complete).toBe(true);
    expect(all.frames).toHaveLength(12);
    expect(all.cursor.info).toMatchObject({ cols: COLS, rows: ROWS, fps: 10 });
    const cells = richFrameToCells(all.frames[0], COLS, ROWS);
    expect(cells).toHaveLength(ROWS);
    expect(cells[0]).toHaveLength(COLS);
    // a reader that started on the gzip form continues across the brotli swap
    const tail = readFrames(h.path, { ...mid.cursor, bytes: 0 });
    expect(tail.frames.length + mid.cursor.frames).toBe(12);
  });

  it('shares one run between concurrent requests (one spawn) and serves later ones from cache', async () => {
    const svc = make();
    const a = svc.requestClip(REQ);
    const b = svc.requestClip(REQ);
    expect(a).toBe(b);
    await tick();
    kids[0].frame(1);
    kids[0].finish();
    await a.done;
    expect(svc.spawned()).toBe(1);
    expect(await svc.requestClip(REQ).done).toBe('complete');
    expect(svc.spawned()).toBe(1);
  });

  it('a cut-off run is never marked complete and leaves no file', async () => {
    const svc = make();
    const h = svc.requestClip(REQ);
    await tick();
    kids[0].frame(1);
    kids[0].frame(2);
    await tick();
    kids[0].emit('close', 1);
    expect(await h.done).toBe('decode');
    expect(fs.existsSync(h.path)).toBe(false);
    const again = svc.requestClip(REQ);
    await tick();
    expect(kids).toHaveLength(2);
    kids[1].finish();
    await again.done;
  });

  it('the clip length cap kills the run and is not complete', async () => {
    const svc = make({ maxFrames: () => 2 });
    const h = svc.requestClip(REQ);
    await tick();
    for (let i = 0; i < 5; i++) kids[0].frame(i);
    expect(await h.done).toBe('oversize');
    expect(kids[0].killed).toBe(true);
    expect(fs.existsSync(h.path)).toBe(false);
  });

  it('at most two ffmpeg at once; the third waits for a slot', async () => {
    const svc = make();
    const r = (n: number) => svc.requestClip({ ...REQ, url: `https://example.com/${n}.mp4` });
    const hs = [r(1), r(2), r(3)];
    await tick();
    expect(kids).toHaveLength(2);
    kids[0].frame(1); kids[0].finish();
    await hs[0].done;
    await tick();
    expect(kids).toHaveLength(3);
    kids[1].frame(1); kids[1].finish(); kids[2].frame(1); kids[2].finish();
    await Promise.all(hs.map((h) => h.done));
  });

  it('reports no-ffmpeg and no-yt-dlp without spawning', async () => {
    const none = make({ tools: () => ({ ffmpeg: null, ytDlp: null }) });
    expect(await none.requestClip(REQ).done).toBe('no-ffmpeg');
    const noYt = make();
    expect(await noYt.requestClip({ ...REQ, kind: 'embed', url: 'https://youtu.be/x' }).done).toBe('no-yt-dlp');
    expect(kids).toHaveLength(0);
  });

  it('evicts the least recently used files over the cap, never one being written', async () => {
    const svc = make({ cacheCapBytes: 1000 });
    const old = path.join(dir, 'old-v1-8x4.frames');
    const newer = path.join(dir, 'newer-v1-8x4.frames');
    fs.writeFileSync(old, Buffer.alloc(800));
    fs.writeFileSync(newer, Buffer.alloc(800));
    fs.utimesSync(old, new Date(1000), new Date(1000));
    const h = svc.requestClip(REQ);
    await tick();
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(newer)).toBe(true);
    expect(fs.existsSync(h.path)).toBe(true);
    kids[0].frame(1); kids[0].finish();
    await h.done;
  });

  it('the reader tails a growing file and only takes whole chunks', async () => {
    const svc = make({ keyframeInterval: Infinity });
    const h = svc.requestClip(REQ);
    await tick();
    let cur = newFrameCursor();
    let total = 0;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 10; i++) kids[0].frame(round * 10 + i);
      await tick();
      const r = readFrames(h.path, cur);
      total += r.frames.length;
      cur = r.cursor;
      expect(total).toBe(cur.frames);
    }
    expect(total).toBe(29); // the 30th frame waits in the next chunk (the header took a slot)
    // a half-written chunk is not taken
    const size = fs.statSync(h.path).size;
    fs.appendFileSync(h.path, Buffer.from([0, 0, 1, 0, 1, 2]));
    expect(readFrames(h.path, cur).frames).toHaveLength(0);
    expect(fs.statSync(h.path).size).toBe(size + 6);
    fs.truncateSync(h.path, size);
    kids[0].finish();
    await h.done;
  });

  it('the door reaches the service through the globalThis key', () => {
    const svc = make();
    registerMagazineVideoService(svc);
    expect(getMagazineVideoService()).toBe(svc);
    registerMagazineVideoService(null);
    expect(getMagazineVideoService()).toBeNull();
  });
});
