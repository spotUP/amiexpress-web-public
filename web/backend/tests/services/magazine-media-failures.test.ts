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
import { createRobotsCache, type HttpResult } from '../../src/services/magazine/body-prefetch';
import { STORY_MAX_PICTURES, MAX_IMAGE_BYTES } from '../../src/services/magazine/media-fetch';
import { readSidecar, renderStoryMedia } from '../../src/services/magazine/media-render';
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

interface Case { name: string; want: string; setup: () => { media: ReturnType<typeof img>[]; http?: HttpResult; tools?: { ffmpeg: string | null; ytDlp: null }; timers?: boolean } }

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
    return { media: [{ ...img(1, 'video'), url: 'https://img.example.org/clip.mp4' }], tools: { ffmpeg: '/fake/ffmpeg', ytDlp: null }, timers: true };
  } },
  { name: 'per-story media cap', want: 'story-cap', setup: () => {
    get.mockResolvedValue(reply(png(200, 200), 'image/png'));
    return { media: Array.from({ length: STORY_MAX_PICTURES + 1 }, (_, i) => img(i + 1)) };
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
    if (want === 'story-cap') expect(readSidecar(file)!.pictures).toHaveLength(STORY_MAX_PICTURES);

    const fetches = get.mock.calls.length, spawns = spawn.mock.calls.length, httpCalls = http.mock.calls.length;
    const second = await renderStoryMedia({ media: first.media }, file, deps, writeAtomic);
    expect(get.mock.calls.length).toBe(fetches);
    expect(spawn.mock.calls.length).toBe(spawns);
    expect(http.mock.calls.length).toBe(httpCalls);
    expect(second.failed).toBe(0);
    expect(second.media!.filter((m) => m.failure)).toHaveLength(1);
  });
});
