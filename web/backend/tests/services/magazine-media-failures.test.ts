/**
 * MAG MEDIA FAILURE PATHS (plan 2026-10-19-mag-linked-media-ascii, M12).
 * Each failure kind through renderStoryMedia: one failure recorded on the media
 * entry, the story text untouched, nothing fetched again on the next pass.
 */
import axios from 'axios';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { createRobotsCache, needsMedia, prefetchBodies, type HttpResult } from '../../src/services/magazine/body-prefetch';
import { MAX_IMAGE_BYTES } from '../../src/services/magazine/media-fetch';
import { letterbox, readSidecar, renderPicture, renderStoryMedia } from '../../src/services/magazine/media-render';
import { renderingKey, SIDECAR_RENDER_REVISION, sidecarSizes, SPAN_ROW_CAP, spanBox } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { SUB_X, SUB_Y } from '@amiexpress/bbs-door-sdk/media/ascii';
import { writeAtomic } from '../../src/services/magazine';

// Conversion is not under test here; the real converter made the cap case take minutes.
const blankCells = (_s: unknown, cols: number, rows: number) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ char: ' ', fg: 0, bg: 0 })));

jest.mock('axios');
jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const spawn = require('child_process').spawn as jest.Mock;
const get = axios.get as unknown as jest.Mock;

function png(w: number, h: number): Buffer {
  const p = new PNG({ width: w, height: h });
  p.data.fill(120);
  return PNG.sync.write(p);
}
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
const reply = (body: Buffer, type: string, extra: Record<string, string> = {}) => ({
  status: 200, data: ab(body), headers: { 'content-type': type, ...extra },
});
const NOW = new Date('2026-10-19T12:00:00Z');
const robotsOk: HttpResult = { status: 200, body: 'User-agent: *\nDisallow:\n', contentType: 'text/plain' };
const robotsNo: HttpResult = { status: 200, body: 'User-agent: *\nDisallow: /\n', contentType: 'text/plain' };
const img = (n: number, kind: 'image' | 'video' = 'image') =>
  ({ url: `https://img.example.org/${n}.png`, kind, alt: '', site: 'example.org', anchor: 1 });

let root: string;
beforeEach(() => { get.mockReset(); spawn.mockReset(); root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-fail-')); });
afterEach(() => { jest.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

interface Case { name: string; want: string; setup: () => { media: ReturnType<typeof img>[]; http?: HttpResult; tools?: { ffmpeg: string | null; ytDlp: null, ffprobe: null }; timers?: boolean; probe?: boolean } }

const cases: Case[] = [
  { name: 'HTTP 404', want: '404', setup: () => {
    get.mockResolvedValue({ status: 404, data: new ArrayBuffer(0), headers: {} });
    return { media: [img(1)] };
  } },
  { name: 'oversize body', want: 'oversize', setup: () => {
    get.mockResolvedValue(reply(Buffer.alloc(10), 'image/png', { 'content-length': String(MAX_IMAGE_BYTES + 1) }));
    return { media: [img(1)] };
  } },
  { name: 'bad content-type', want: 'bad-content-type', setup: () => {
    get.mockResolvedValue(reply(Buffer.from('<html></html>'), 'text/html'));
    return { media: [img(1)] };
  } },
  { name: 'robots disallow', want: 'robots', setup: () => {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    return { media: [img(1)], http: robotsNo };
  } },
  { name: 'image decode error', want: 'decode', setup: () => {
    const bad = png(200, 200).subarray(0, 40); // valid signature and header, truncated data
    get.mockResolvedValue(reply(bad, 'image/png'));
    return { media: [img(1)] };
  } },
  { name: 'ffmpeg timeout (video poster)', want: 'timeout', setup: () => {
    spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill: jest.fn() });
      return child;
    });
    return { media: [{ ...img(1, 'video'), url: 'https://img.example.org/clip.mp4' }], tools: { ffmpeg: '/fake/ffmpeg', ytDlp: null, ffprobe: '/fake/ffprobe' }, probe: true, timers: true };
  } },
];

describe('a failed picture is recorded once and never retried', () => {
  it.each(cases)('$name', async ({ want, setup }) => {
    const s = setup();
    if (s.timers) jest.useFakeTimers();
    const http = jest.fn(async (url: string): Promise<HttpResult> => (url.endsWith('/robots.txt') ? (s.http ?? robotsOk) : robotsOk));
    const deps = {
      now: () => NOW, robots: createRobotsCache(), gate: jest.fn(async () => {}), http,
      convert: blankCells, ...(s.tools ? { tools: s.tools } : {}),
      ...(s.probe ? { probe: async () => ({ hasVideo: true, durationSec: 10 }) } : {}),
    };
    const story = { headline: 'H', body: 'Body text stays.', media: s.media };
    const file = path.join(root, 's1.json');
    const run = renderStoryMedia(story, file, deps, writeAtomic);
    if (s.timers) await jest.advanceTimersByTimeAsync(16_000);
    const first = await run;

    expect(story.body).toBe('Body text stays.');
    const failed = first.media!.filter((m) => m.failure);
    expect(failed.map((m) => m.failure)).toEqual([want]);
    expect(first.failed).toBe(1);
    const last = first.media![first.media!.length - 1];
    expect(last.failure).toBe(want);

    const fetches = get.mock.calls.length, spawns = spawn.mock.calls.length, httpCalls = http.mock.calls.length;
    const second = await renderStoryMedia({ media: first.media }, file, deps, writeAtomic);
    expect(get.mock.calls.length).toBe(fetches);
    expect(spawn.mock.calls.length).toBe(spawns);
    expect(http.mock.calls.length).toBe(httpCalls);
    expect(second.failed).toBe(0);
    expect(second.media!.filter((m) => m.failure)).toHaveLength(1);
  });
});

describe('a story keeps every picture it links', () => {
  const deps = () => ({
    now: () => NOW, robots: createRobotsCache(), gate: jest.fn(async () => {}),
    http: jest.fn(async (): Promise<HttpResult> => robotsOk), convert: blankCells,
  });

  it('renders all 18 pictures of an 18-picture story (story 8946413e lost 15 to the old cap)', async () => {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    const file = path.join(root, 'many.json');
    const out = await renderStoryMedia({ media: Array.from({ length: 18 }, (_, i) => img(i + 1)) }, file, deps(), writeAtomic);
    expect(out.failed).toBe(0);
    expect(readSidecar(file)!.pictures).toHaveLength(18);
  });

  it('retries a picture an older ingest recorded as story-cap', async () => {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    const file = path.join(root, 'capped.json');
    const out = await renderStoryMedia({ media: [img(1), { ...img(2), failure: 'story-cap' }, { ...img(3), failure: '404' }] }, file, deps(), writeAtomic);
    expect(out.media!.map((m) => m.failure)).toEqual([undefined, undefined, '404']);
    expect(readSidecar(file)!.pictures.map((p) => p.media)).toEqual([0, 1]);
  });

  it('asks again for a story an older ingest capped, even though it has a sidecar (8946413e stayed at 3 of 18)', () => {
    const dir = path.join(root, 'Magazine', 'stories');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'capped.media.json'), JSON.stringify({ version: 1, pictures: [] }));
    const story = { id: 'capped', source: 'HN', headline: 'H', url: 'https://news.example.org/a', firstSeen: NOW.toISOString(), body: 'Body.' };
    const ok = { ...story, media: [img(1)] };
    const capped = { ...story, media: [img(1), { ...img(2), failure: 'story-cap' as const }] };
    expect(needsMedia(ok as never, root, NOW.getTime())).toBe(false);
    expect(needsMedia(capped as never, root, NOW.getTime())).toBe(true);
  });
});

describe('a story with text but no pictures rendered gets them from the next prefetch', () => {
  it('renders the listed pictures once, keeps the text, and leaves a failed-only story alone', async () => {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    const dir = path.join(root, 'Magazine', 'stories');
    fs.mkdirSync(dir, { recursive: true });
    const base = { source: 'HN', headline: 'H', url: 'https://news.example.org/a', firstSeen: NOW.toISOString(), body: 'Body text stays.' };
    fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify({ ...base, id: 'old', media: [img(1), img(2)] }));
    fs.writeFileSync(path.join(dir, 'dead.json'), JSON.stringify({ ...base, id: 'dead', media: [{ ...img(3), failure: '404' }] }));
    const http = jest.fn(async (): Promise<HttpResult> => robotsOk);
    const deps = {
      rootDir: () => root, now: () => NOW, log: () => {}, robots: createRobotsCache(),
      gate: jest.fn(async () => {}), http, extract: () => null, convert: blankCells,
    };

    const first = await prefetchBodies(deps);
    expect(first.pictured).toBe(1);
    expect(readSidecar(path.join(dir, 'old.json'))!.pictures.map((p) => p.media)).toEqual([0, 1]);
    expect(readSidecar(path.join(dir, 'dead.json'))).toBeNull();
    const story = JSON.parse(fs.readFileSync(path.join(dir, 'old.json'), 'utf8'));
    expect(story.body).toBe('Body text stays.');
    expect(story.media).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);

    const second = await prefetchBodies(deps);
    expect(second.pictured).toBe(0);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('a video must play before its poster is shown', () => {
  const tools = { ffmpeg: '/fake/ffmpeg', ytDlp: null, ffprobe: '/fake/ffprobe' };
  const clip = { ...img(1, 'video'), url: 'https://img.example.org/clip.mp4', poster: 'https://img.example.org/poster.png' };
  async function run(probe: unknown) {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    const deps = {
      now: () => NOW, robots: createRobotsCache(), gate: jest.fn(async () => {}),
      http: jest.fn(async (): Promise<HttpResult> => robotsOk), convert: blankCells, tools,
      probe: jest.fn(async () => probe),
    };
    const file = path.join(root, 'v.json');
    const out = await renderStoryMedia({ headline: 'H', body: 'B', media: [{ ...clip }] }, file, deps as never, writeAtomic);
    return { out, side: readSidecar(file), probe: deps.probe };
  }

  it('too long: recorded oversize, no picture', async () => {
    const r = await run({ hasVideo: true, durationSec: 181 });
    expect(r.out.media![0].failure).toBe('oversize');
    expect(r.side?.pictures ?? []).toHaveLength(0);
  });
  it('probe fails: recorded 404, no picture', async () => {
    const r = await run('404');
    expect(r.out.media![0].failure).toBe('404');
    expect(r.side?.pictures ?? []).toHaveLength(0);
  });
  it('no video stream: recorded 404', async () => {
    const r = await run({ hasVideo: false, durationSec: 10 });
    expect(r.out.media![0].failure).toBe('404');
  });
  it('playable: keeps its poster picture', async () => {
    const r = await run({ hasVideo: true, durationSec: 147 });
    expect(r.out.media![0].failure).toBeUndefined();
    expect(r.probe).toHaveBeenCalledWith(clip.url);
    expect(r.side!.pictures).toHaveLength(1);
  });
});

describe('a picture keeps its shape in every box', () => {
  const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(200) });

  it('pads a wide picture top and bottom with black, picture centred', () => {
    const src = { data: new Uint8Array(40 * 10 * 3).fill(200), width: 40, height: 10, channels: 3 as const };
    const out = letterbox(src, 4, 4); // box 4*SUB_X x 4*SUB_Y
    expect(out.width / out.height).toBeCloseTo((4 * SUB_X) / (4 * SUB_Y), 1);
    expect(out.data[0]).toBe(0);
    const mid = (Math.floor(out.height / 2) * out.width + Math.floor(out.width / 2)) * 3;
    expect(out.data[mid]).toBe(200);
  });

  it('the fullscreen poster of a 16:9 clip is not stretched to the 80x24 box (live report 2026-10-20)', () => {
    const seen: { key: string; aspect: number; box: number }[] = [];
    const sizes = sidecarSizes();
    let i = 0;
    renderPicture(rgba(320, 180) as never, ((s: { width: number; height: number }, cols: number, rows: number) => {
      seen.push({ key: sizes[i++].key, aspect: s.width / s.height, box: (cols * SUB_X) / (rows * SUB_Y) });
      return blankCells(s, cols, rows);
    }) as never);
    expect(seen.length).toBe(sizes.length);
    for (const s of seen) expect(s.aspect).toBeCloseTo(s.box, 1);
  });

  it('a span rendering crosses the content width for a wide picture and narrows for a tall one', () => {
    const spanCols = sidecarSizes().find((s) => s.placement === 'span')!.cols;
    const wide = renderPicture(rgba(400, 100) as never, blankCells as never);
    expect(wide[renderingKey('ansi', spanCols, 'span')]?.rows.length).toBeLessThanOrEqual(SPAN_ROW_CAP);
    // 16:9 at the row cap: wider than a column, narrower than the page.
    const clip = spanBox(320, 180, spanCols, SPAN_ROW_CAP);
    expect(clip.cols).toBeGreaterThan(sidecarSizes().find((s) => s.placement === 'column' && s.terminal === 'ansi')!.cols);
    expect(renderPicture(rgba(320, 180) as never, blankCells as never)[renderingKey('ansi', clip.cols, 'span')]?.rows).toHaveLength(SPAN_ROW_CAP);
    const tall = renderPicture(rgba(180, 320) as never, blankCells as never);
    const box = spanBox(180, 320, spanCols, SPAN_ROW_CAP);
    expect(box.cols).toBeLessThan(spanCols);
    expect(tall[renderingKey('ansi', box.cols, 'span')]?.cols).toBe(box.cols);
    expect(tall[renderingKey('ansi', spanCols, 'span')]).toBeUndefined();
  });
});

describe('pictures rendered by an older converter are redone', () => {
  const deps = () => ({
    now: () => NOW, robots: createRobotsCache(), gate: jest.fn(async () => {}),
    http: jest.fn(async (): Promise<HttpResult> => robotsOk), convert: blankCells,
  });

  it('refetches a picture whose sidecar entry has no or an old render revision, reuses a current one', async () => {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    const file = path.join(root, 'old.json');
    const media = [img(1), img(2), img(3)];
    fs.writeFileSync(path.join(root, 'old.media.json'), JSON.stringify({ version: 1, pictures: [
      { media: 0, url: media[0].url, renderings: {} },
      { media: 1, url: media[1].url, render: SIDECAR_RENDER_REVISION - 1, renderings: {} },
      { media: 2, url: media[2].url, render: SIDECAR_RENDER_REVISION, renderings: {} },
    ] }));
    const out = await renderStoryMedia({ media }, file, deps(), writeAtomic);
    expect(out.rendered).toBe(2);
    expect(out.reused).toBe(1);
    expect(readSidecar(file)!.pictures.map((p) => p.render)).toEqual([SIDECAR_RENDER_REVISION, SIDECAR_RENDER_REVISION, SIDECAR_RENDER_REVISION]);
  });

  it('the prefetch asks again for a story whose sidecar is from an older render revision', () => {
    const dir = path.join(root, 'Magazine', 'stories');
    fs.mkdirSync(dir, { recursive: true });
    const story = { id: 'old', source: 'HN', headline: 'H', url: 'https://news.example.org/a', firstSeen: NOW.toISOString(), body: 'Body.', media: [img(1)] };
    const write = (render?: number) => fs.writeFileSync(path.join(dir, 'old.media.json'),
      JSON.stringify({ version: 1, pictures: [{ media: 0, url: img(1).url, ...(render === undefined ? {} : { render }), renderings: {} }] }));
    write();
    expect(needsMedia(story as never, root, NOW.getTime())).toBe(true);
    write(SIDECAR_RENDER_REVISION);
    expect(needsMedia(story as never, root, NOW.getTime())).toBe(false);
  });
});
