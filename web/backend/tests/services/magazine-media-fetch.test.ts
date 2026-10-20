/**
 * Magazine media fetch (M4/M5): one picture, fetched politely, decoded to
 * RGBA, every failure a reason string. axios is mocked; fixtures are encoded
 * in the test.
 */
import axios from 'axios';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';
import { spawnSync } from 'child_process';
import {
  STORY_MAX_PICTURES,
  createMediaBudget,
  fetchImage,
  mediaTools,
  resetMediaTools,
  type MediaFetchDeps,
} from '../../src/services/magazine/media-fetch';
import { createRobotsCache, type HttpResult } from '../../src/services/magazine/body-prefetch';

jest.mock('axios');
const get = axios.get as unknown as jest.Mock;

function png(w: number, h: number): Buffer {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 200; p.data[i + 1] = 40; p.data[i + 2] = 10; p.data[i + 3] = 255; }
  return PNG.sync.write(p);
}
function jpg(w: number, h: number): Buffer {
  const data = Buffer.alloc(w * h * 4, 128);
  return jpeg.encode({ data, width: w, height: h }, 80).data;
}
const reply = (body: Buffer, type = 'image/png', status = 200) => ({
  status, data: body.buffer.slice(body.byteOffset, body.byteOffset + body.length), headers: { 'content-type': type },
});

const robotsOk: HttpResult = { status: 200, body: 'User-agent: *\nDisallow:\n', contentType: 'text/plain' };
function deps(robots: HttpResult = robotsOk, tools?: MediaFetchDeps['tools']): MediaFetchDeps & { http: jest.Mock; gate: jest.Mock } {
  return { now: () => new Date('2026-10-19T12:00:00Z'), robots: createRobotsCache(), gate: jest.fn(async () => {}), http: jest.fn(async () => robots), tools };
}
const item = (url = 'https://img.example.org/a/pic.png') => ({ url });

beforeEach(() => { get.mockReset(); });

describe('fetchImage', () => {
  it('decodes a PNG to RGBA through the host gate and robots', async () => {
    get.mockResolvedValue(reply(png(120, 110)));
    const d = deps();
    const b = createMediaBudget();
    const r = await fetchImage(item(), b, d);
    expect(r).toEqual({ pixels: expect.objectContaining({ width: 120, height: 110 }) });
    if (typeof r === 'string') throw new Error(r);
    expect(r.pixels.data.length).toBe(120 * 110 * 4);
    expect(Array.from(r.pixels.data.slice(0, 4))).toEqual([200, 40, 10, 255]);
    expect(d.http).toHaveBeenCalledWith('https://img.example.org/robots.txt', expect.anything());
    expect(d.gate).toHaveBeenCalledWith('https://img.example.org/a/pic.png', 5000);
    expect(b.pictures).toBe(1);
    expect(b.bytes).toBeGreaterThan(0);
  });

  it('decodes a JPEG', async () => {
    get.mockResolvedValue(reply(jpg(130, 105), 'image/jpeg'));
    const r = await fetchImage(item('https://img.example.org/p.jpg'), createMediaBudget(), deps());
    expect(r).toEqual({ pixels: expect.objectContaining({ width: 130, height: 105 }) });
  });

  it('rejects an oversize body (transport cap)', async () => {
    get.mockRejectedValue(Object.assign(new Error('maxContentLength size of 3145728 exceeded'), { code: 'ERR_BAD_RESPONSE' }));
    expect(await fetchImage(item(), createMediaBudget(), deps())).toBe('oversize');
  });

  it('rejects more than 4 megapixels from the header, before decoding', async () => {
    get.mockResolvedValue(reply(png(2100, 2000)));
    expect(await fetchImage(item(), createMediaBudget(), deps())).toBe('oversize');
  });

  it('rejects a non-image content type', async () => {
    get.mockResolvedValue(reply(Buffer.from('<html>'), 'text/html'));
    expect(await fetchImage(item(), createMediaBudget(), deps())).toBe('bad-content-type');
  });

  it('skips pictures under 100 px on a side without spending the budget', async () => {
    get.mockResolvedValue(reply(png(1, 1)));
    const b = createMediaBudget();
    expect(await fetchImage(item(), b, deps())).toBe('too-small');
    expect(b.pictures).toBe(0);
  });

  it('maps 404 and timeout', async () => {
    get.mockResolvedValue(reply(Buffer.alloc(0), 'text/html', 404));
    expect(await fetchImage(item(), createMediaBudget(), deps())).toBe('404');
    get.mockRejectedValue(Object.assign(new Error('t'), { code: 'ECONNABORTED' }));
    expect(await fetchImage(item(), createMediaBudget(), deps())).toBe('timeout');
  });

  it('stops at the story cap (8 pictures) and never fetches the ninth', async () => {
    get.mockResolvedValue(reply(png(100, 100)));
    const b = createMediaBudget();
    const d = deps();
    for (let i = 0; i < STORY_MAX_PICTURES; i++) expect(typeof await fetchImage(item(), b, d)).toBe('object');
    get.mockClear();
    expect(await fetchImage(item(), b, d)).toBe('story-cap');
    expect(get).not.toHaveBeenCalled();
  });

  it('stops at the story wall-clock cap', async () => {
    let t = 0;
    const b = createMediaBudget(() => t);
    t = 91_000;
    expect(await fetchImage(item(), b, deps())).toBe('story-cap');
  });

  it('obeys robots.txt of the picture host', async () => {
    const d = deps({ status: 200, body: 'User-agent: *\nDisallow: /a/\n', contentType: 'text/plain' });
    expect(await fetchImage(item(), createMediaBudget(), d)).toBe('robots');
    expect(get).not.toHaveBeenCalled();
  });

  it('reports no-ffmpeg for a format pngjs/jpeg-js cannot read when ffmpeg is missing', async () => {
    get.mockResolvedValue(reply(Buffer.from('RIFF....WEBPVP8 '), 'image/webp'));
    const r = await fetchImage(item('https://img.example.org/p.webp'), createMediaBudget(), deps(robotsOk, { ffmpeg: null, ytDlp: null, ffprobe: null }));
    expect(r).toBe('no-ffmpeg');
  });

  it('a corrupt PNG is a decode failure, never a throw', async () => {
    const bad = png(120, 120).subarray(0, 60);
    get.mockResolvedValue(reply(bad));
    expect(await fetchImage(item(), createMediaBudget(), deps())).toBe('decode');
  });
});

describe('mediaTools', () => {
  it('looks up once and caches', () => {
    resetMediaTools();
    expect(mediaTools()).toBe(mediaTools());
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
(hasFfmpeg ? describe : describe.skip)('ffmpeg decode (skipped when ffmpeg is not installed on this machine)', () => {
  it('decodes a GIF first frame through ffmpeg', async () => {
    const make = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=128x112', '-frames:v', '1', '-f', 'gif', 'pipe:1']);
    expect(make.status).toBe(0);
    get.mockResolvedValue(reply(make.stdout, 'image/gif'));
    const r = await fetchImage(item('https://img.example.org/p.gif'), createMediaBudget(), deps(robotsOk, { ffmpeg: 'ffmpeg', ytDlp: null, ffprobe: null }));
    expect(r).toEqual({ pixels: expect.objectContaining({ width: 128, height: 112 }) });
  });
});
